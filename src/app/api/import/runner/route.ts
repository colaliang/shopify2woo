import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseServer, getUserIdFromToken } from "@/lib/supabaseServer";
import { appendLog } from "@/lib/logs";
import { pgmqQueueName, pgmqRead, pgmqDelete, pgmqArchive, pgmqSetVt } from "@/lib/pgmq";
// import-jobs 相关逻辑已移除
import { recordResult } from "@/lib/history";
import { ensureTerms, findProductBySkuOrSlug, wooPost, wooPut, wooGet, wooDelete, type WooConfig } from "@/lib/woo";
import { fetchProductByHandle, type ShopifyProduct } from "@/lib/shopify";
import { getImportCache, saveImportCache, isCacheValid, sha256 } from "@/lib/cache";
import { buildWooProductPayload, buildVariationFromShopifyVariant } from "@/lib/importMap";
import { fetchHtmlMeta, buildWpPayloadFromHtml, buildWpVariationsFromHtml, extractJsonLdProduct } from "@/lib/wordpressScrape";
import { normalizeWpSlugOrLink, type WooProduct } from "@/lib/wordpress";
import { buildWixPayload, buildWixVariationsFromHtml } from "@/lib/wixScrape";
const lastRunBySource = new Map<string, number>();
const inFlightSources = new Set<string>();
let lastCleanupAt = 0;

// WordPress 产品数据负载接口
interface WordPressProductPayload {
  name?: string;
  slug?: string;
  sku?: string;
  description?: string;
  short_description?: string;
  images?: Array<{ src: string }>;
  categories?: Array<{ id: number }>;
  tags?: Array<{ id: number }>;
}

type ShopifyCachePre = { product?: ShopifyProduct; payload?: Record<string, unknown> };
type WpCachePre = { slug?: string; sku?: string; name?: string; description?: string; short_description?: string; imagesAbs?: string[]; catNames?: string[]; tagNames?: string[]; payload?: WordPressProductPayload };
type WixCachePre = { slug?: string; name?: string; description?: string; short_description?: string; imagesAbs?: string[]; catNames?: string[]; tagNames?: string[]; payload?: WordPressProductPayload };



// 事务跟踪器 - 跟踪每个请求中创建或更新的产品
interface TransactionTracker {
  createdProducts: number[]; // 新创建的产品ID
  updatedProducts: number[]; // 更新的产品ID
  originalProducts: Map<number, WooProduct>; // 更新前的产品数据（用于回滚）
}

// PGMQ 消息类型定义
interface PgmqMessage {
  userId?: string;
  requestId?: string;
  source?: string;
  handle?: string;
  shopifyBaseUrl?: string;
  categories?: string[];
  tags?: string[];
  link?: string;
}

const transactionStore = new Map<string, TransactionTracker>();
const termListCacheStore = new Map<string, { category: Map<string, Array<{ id: number }>>; tag: Map<string, Array<{ id: number }>> }>();
const productCacheStore = new Map<string, { bySku: Map<string, WooProduct | null>; bySlug: Map<string, WooProduct | null> }>();

// 获取或创建事务跟踪器
function getTransactionTracker(requestId: string): TransactionTracker {
  if (!transactionStore.has(requestId)) {
    transactionStore.set(requestId, {
      createdProducts: [],
      updatedProducts: [],
      originalProducts: new Map()
    });
  }
  return transactionStore.get(requestId)!;
}

 

async function ensureBucketPublic(bucket: string) {
  const supabase = getSupabaseServer();
  if (!supabase) return false;
  try { await supabase.storage.createBucket(bucket, { public: true }); } catch {}
  return true;
}

function guessExt(u: string) {
  try { const p = new URL(u).pathname; const m = p.match(/\.([a-zA-Z0-9]+)$/); const e = (m?.[1] || "").toLowerCase(); return e || "jpg"; } catch { return "jpg"; }
}

function guessCt(ext: string) {
  const m = ext.toLowerCase();
  if (m === "jpg" || m === "jpeg") return "image/jpeg";
  if (m === "png") return "image/png";
  if (m === "webp") return "image/webp";
  if (m === "gif") return "image/gif";
  return "application/octet-stream";
}

async function cacheImagesToBucket(baseUrl: string, images: string[], userId: string, requestId: string) {
  const supabase = getSupabaseServer();
  const bucket = process.env.IMAGE_CACHE_BUCKET || "import-images";
  const timeoutMs = parseInt(process.env.IMAGE_FETCH_TIMEOUT_MS || "15000", 10) || 15000;
  const out: string[] = [];
  if (!supabase) return images.map((u) => new URL(u, baseUrl).toString());
  await ensureBucketPublic(bucket);
  for (const u of images) {
    const abs = new URL(u, baseUrl).toString();
    const ext = guessExt(abs);
    const hash = createHash("sha1").update(abs).digest("hex");
    const dir = "by-url";
    const name = `${hash}.${ext}`;
    const path = `${dir}/${name}`;
    try {
      const { data: listed } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 1 });
      const exists = Array.isArray(listed) && listed.some((it: { name: string }) => it.name === name);
      if (!exists) {
        let buf: ArrayBuffer | null = null;
        let ct = guessCt(ext);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const r = await fetch(abs, { signal: controller.signal });
          clearTimeout(timer);
          if (!r.ok) throw new Error(`fetch ${r.status}`);
          buf = await r.arrayBuffer();
          ct = r.headers.get("content-type") || ct;
        } catch (e) {
          clearTimeout(timer);
          await appendLog(userId, requestId, "error", `image_fetch_failed url=${abs} err=${String(e)}`);
          out.push(abs);
          continue;
        }
        try {
          const { error } = await supabase.storage.from(bucket).upload(path, new Uint8Array(buf || new ArrayBuffer(0)), { contentType: ct, upsert: false });
          if (error) throw error;
          await appendLog(userId, requestId, "info", `image_uploaded path=${path} ct=${ct}`);
        } catch (e) {
          await appendLog(userId, requestId, "error", `image_upload_failed path=${path} err=${String(e)}`);
          out.push(abs);
          continue;
        }
      } else {
        await appendLog(userId, requestId, "info", `image_cached_hit name=${name}`);
      }
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      out.push(data.publicUrl);
    } catch (e) {
      await appendLog(userId, requestId, "error", `image_cache_error url=${abs} err=${String(e)}`);
      out.push(abs);
    }
  }
  return out;
}

async function cleanupExpiredImages() {
  const supabase = getSupabaseServer();
  if (!supabase) return;
  const bucket = process.env.IMAGE_CACHE_BUCKET || "import-images";
  const days = parseInt(process.env.IMAGE_CACHE_TTL_DAYS || "7", 10) || 7;
  const older = Date.now() - days * 24 * 3600 * 1000;
  try {
    let offset = 0;
    const limit = 1000;
    for (;;) {
      const { data: objs } = await supabase.storage.from(bucket).list("by-url", { limit, offset });
      if (!objs || !objs.length) break;
      const toDel = objs
        .filter((o: { created_at?: string; name: string }) => new Date(String(o.created_at || 0)).getTime() < older)
        .map((o: { name: string }) => `by-url/${o.name}`);
      if (toDel.length) {
        await supabase.storage.from(bucket).remove(toDel);
      }
      offset += objs.length;
      if (objs.length < limit) break;
    }
  } catch {}
}

// 清理事务跟踪器
function cleanupTransactionTracker(requestId: string) {
  transactionStore.delete(requestId);
  termListCacheStore.delete(requestId);
  productCacheStore.delete(requestId);
}

// 回滚事务 - 删除创建的产品，恢复更新的产品
async function rollbackTransaction(requestId: string, dstCfg: WooConfig) {
  const tracker = transactionStore.get(requestId);
  if (!tracker) return;

  try {
    // 删除所有新创建的产品
    for (const productId of tracker.createdProducts) {
      try {
        await wooDelete(dstCfg, `index.php/wp-json/wc/v3/products/${productId}?force=true`, {
          userId: "system",
          requestId,
          productHandle: `id-${productId}`
        });
        console.log(`已回滚创建的产品: ${productId}`);
      } catch (deleteError) {
        console.error(`回滚删除产品失败: ${productId}`, deleteError);
      }
    }

    // 恢复所有更新的产品到原始状态
    for (const [productId, originalData] of tracker.originalProducts.entries()) {
      try {
        await wooPut(dstCfg, `index.php/wp-json/wc/v3/products/${productId}`, originalData, {
          userId: "system", 
          requestId,
          productHandle: `id-${productId}`
        });
        console.log(`已回滚更新的产品: ${productId}`);
      } catch (restoreError) {
        console.error(`回滚恢复产品失败: ${productId}`, restoreError);
      }
    }
  } finally {
    cleanupTransactionTracker(requestId);
  }
}

export const runtime = "nodejs";

async function ensureTermsCached(dstCfg: WooConfig, type: "category" | "tag", names: string[], requestId: string) {
  if (!termListCacheStore.has(requestId)) termListCacheStore.set(requestId, { category: new Map(), tag: new Map() });
  const store = termListCacheStore.get(requestId)!;
  const cache = type === "category" ? store.category : store.tag;
  const key = names.join("|");
  if (cache.has(key)) return cache.get(key)!;
  const res = await ensureTerms(dstCfg, type, names);
  cache.set(key, res);
  return res;
}

async function findProductCached(dstCfg: WooConfig, sku: string | undefined, slug: string | undefined, requestId: string) {
  if (!productCacheStore.has(requestId)) productCacheStore.set(requestId, { bySku: new Map(), bySlug: new Map() });
  const store = productCacheStore.get(requestId)!;
  if (sku && store.bySku.has(sku)) return store.bySku.get(sku)!;
  if (slug && store.bySlug.has(slug)) return store.bySlug.get(slug)!;
  const existing = await findProductBySkuOrSlug(dstCfg, sku, slug);
  if (sku) store.bySku.set(sku, existing || null);
  if (slug) store.bySlug.set(slug, existing || null);
  return existing;
}

async function authorize(req: Request) {
  if (process.env.RUNNER_ALLOW_ANON === "1") return true;
  const token = process.env.RUNNER_TOKEN || "";
  if (!token) return true;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const url = new URL(req.url);
  const qp = url.searchParams.get("token") || "";
  if (qp && qp === token) return true;
  if (bearer && bearer === token) return true;
  if (bearer) {
    const uid = await getUserIdFromToken(bearer);
    if (uid) return true;
  }
  return false;
}

 

export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const supabase = getSupabaseServer();
    if (!supabase) {
      const missing: string[] = [];
      if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
      return NextResponse.json({ error: "服务未配置", missing_envs: missing }, { status: 500 });
    }
    const url = new URL(req.url);
    const src = url.searchParams.get("source") || undefined;
    const maxJobs = parseInt(process.env.RUNNER_MAX_JOBS_PER_TICK || "2", 10) || 2;
    const batchSizeEnv = parseInt(process.env.RUNNER_MAX_ITEMS_PER_JOB_TICK || "25", 10) || 25;
    if (true) {
      const sources = src ? [src] : ["shopify", "wordpress", "wix"];
      let picked = 0;
      for (const s of sources) {
        const now = Date.now();
        const minInterval = parseInt(process.env.RUNNER_MIN_INTERVAL_MS || "5000", 10) || 5000;
        const last = lastRunBySource.get(s) || 0;
        if (now - last < minInterval) continue;
        if (inFlightSources.has(s)) continue;
        inFlightSources.add(s);
        lastRunBySource.set(s, now);
        // 优先处理高优先级队列
        const qHigh = pgmqQueueName(`${s}_high`);
        const q = pgmqQueueName(s);
        const vt = parseInt(process.env.RUNNER_VT_SECONDS || "60", 10) || 60;
        let msgs = await pgmqRead(qHigh, vt, batchSizeEnv);
        let queueUsed = qHigh;
        if (!msgs.length) { msgs = await pgmqRead(q, vt, batchSizeEnv); queueUsed = q; }
        picked += msgs.length;
        {
          const now2 = Date.now();
          if (!lastCleanupAt || now2 - lastCleanupAt > 60 * 60 * 1000) {
            try { await cleanupExpiredImages(); lastCleanupAt = now2; } catch {}
          }
        }
        
        for (const row of msgs) {
          const msg = (row.message || {}) as PgmqMessage;
          const userId = String(msg.userId || "");
          const requestId = String(msg.requestId || "");
          if (!userId || !requestId) { try { await appendLog(userId || "__UNKNOWN__", requestId || "__UNKNOWN__", "error", `任务被归档：缺少userId或requestId mid=${row.msg_id} queue=${queueUsed}`); } catch {} await pgmqArchive(queueUsed, row.msg_id).catch(()=>{}); continue; }
          try { await appendLog(userId, requestId, "info", `cfg maxJobs=${maxJobs} batchSize=${batchSizeEnv}`); } catch {}
          try { await appendLog(userId, requestId, "info", `begin source=${s} mid=${row.msg_id} queue=${queueUsed} read_ct=${row.read_ct||0}`); } catch {}
          const { data: cfg } = await supabase
            .from("user_configs")
            .select("wordpress_url, consumer_key, consumer_secret")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();
          try { await appendLog(userId, requestId, "info", `queue=${queueUsed} vt=${vt} msg_id=${row.msg_id} read_ct=${row.read_ct||0} wpUrl=${(cfg?.wordpress_url)?"set":"empty"} key=${(cfg?.consumer_key)?"set":"empty"} secret=${(cfg?.consumer_secret)?"set":"empty"}`); } catch {}
          const wordpressUrl = cfg?.wordpress_url || "";
          const consumerKey = cfg?.consumer_key || "";
          const consumerSecret = cfg?.consumer_secret || "";
          if (!wordpressUrl || !consumerKey || !consumerSecret) {
            await appendLog(userId, requestId, "error", "目标站 Woo 配置未设置");
            await pgmqArchive(queueUsed, row.msg_id).catch(()=>{});
            continue;
          }
          
          // 网址验证机制：检查WordPress网址格式是否正确
          try {
            const wpUrlObj = new URL(wordpressUrl);
            if (!wpUrlObj.protocol.startsWith('http')) {
              await appendLog(userId, requestId, "error", `WordPress网址协议无效: ${wordpressUrl}`);
              await pgmqArchive(queueUsed, row.msg_id).catch(()=>{});
              continue;
            }
          } catch {
            await appendLog(userId, requestId, "error", `WordPress网址格式无效: ${wordpressUrl}`);
            await pgmqArchive(queueUsed, row.msg_id).catch(()=>{});
            continue;
          }
          await appendLog(userId, requestId, "info", `WordPress网址验证通过: ${wordpressUrl}`);
          const dstCfg = { url: wordpressUrl, consumerKey, consumerSecret };
          try {
            if (s === "shopify") {
              const categories: string[] = Array.isArray(msg.categories) ? msg.categories : [];
              const tags: string[] = Array.isArray(msg.tags) ? msg.tags : [];
              await appendLog(userId, requestId, "info", `开始处理Shopify产品 handle=${String(msg.handle||"")} 分类=${categories.length} 标签=${tags.length}`);
              let catTerms: Array<{ id: number }> = [];
              let tagTerms: Array<{ id: number }> = [];
              try {
                const prevAuth = process.env.WOO_AUTH_MODE;
                process.env.WOO_AUTH_MODE = "basic";
                try {
                  catTerms = await ensureTermsCached(dstCfg, "category", categories, requestId);
                  tagTerms = await ensureTermsCached(dstCfg, "tag", tags, requestId);
                } finally {
                  process.env.WOO_AUTH_MODE = prevAuth;
                }
                await appendLog(userId, requestId, "info", `准备分类与标签术语完成 handle=${String(msg.handle||"")}`);
              } catch (e) {
                const emsg = e instanceof Error ? e.message : String(e || "术语准备失败");
                await appendLog(userId, requestId, "error", `术语准备失败 handle=${String(msg.handle||"")} err=${emsg}`);
                await recordResult(userId, "shopify", requestId, String(msg.handle||""), String(msg.handle||""), undefined, "error", emsg, undefined);
                continue;
              }
              await appendLog(userId, requestId, "info", `已准备分类和标签术语 handle=${String(msg.handle||"")}`);
              const cacheUrl = (() => { try { return new URL(`/products/${String(msg.handle||"")}`, String(msg.shopifyBaseUrl||"")).toString(); } catch { return String(msg.handle||""); } })();
              const cached = await getImportCache(cacheUrl);
              if (cached) {
                if (isCacheValid(cached)) await appendLog(userId, requestId, "info", `缓存命中 source=shopify url=${cacheUrl}`);
                else await appendLog(userId, requestId, "info", `缓存过期 source=shopify url=${cacheUrl}`);
              } else {
                await appendLog(userId, requestId, "info", `缓存未命中 source=shopify url=${cacheUrl}`);
              }
              const pre: ShopifyCachePre | null = (cached && isCacheValid(cached)) ? (cached.result_json as ShopifyCachePre) : null;
              const product = (pre && pre.product) ? pre.product : await fetchProductByHandle(String(msg.shopifyBaseUrl || ""), String(msg.handle || ""));
              if (!product) {
                const emsg = `not found handle=${String(msg.handle||"")}`;
                await appendLog(userId, requestId, "error", emsg);
                await recordResult(userId, "shopify", requestId, String(msg.handle||""), String(msg.handle||""), undefined, "error", emsg, undefined);
              } else {
                await appendLog(userId, requestId, "info", `获取到Shopify产品 handle=${String(product.handle||"")} 名称=${product.title||""}`);
                const payload = (pre && pre.payload) ? pre.payload : buildWooProductPayload(product);
                payload.categories = catTerms;
                payload.tags = tagTerms;
                if (Array.isArray(payload.images) && payload.images.length) {
                  const orig = payload.images.map((im) => im?.src).filter(Boolean) as string[];
                  const cachedUrls = await cacheImagesToBucket(String(msg.shopifyBaseUrl || ""), orig, userId, requestId);
                  const maxImages = parseInt(process.env.RUNNER_MAX_IMAGES_PER_PRODUCT || "10", 10) || 10;
                  payload.images = Array.from(new Set(cachedUrls)).slice(0, maxImages).map((src) => ({ src }));
                }
                await appendLog(userId, requestId, "info", `构建WooCommerce产品数据完成 handle=${String(product.handle||"")}`);
                let existing: WooProduct | null = null;
                try {
                  existing = await findProductCached(dstCfg, undefined, product.handle, requestId);
                } catch (e) {
                  const emsg = e instanceof Error ? e.message : String(e || "检查现有产品失败");
                  await appendLog(userId, requestId, "error", `检查现有产品失败 handle=${String(msg.handle||"")} err=${emsg}`);
                  await recordResult(userId, "shopify", requestId, String(msg.handle||""), String(msg.handle||""), undefined, "error", emsg, undefined);
                  continue;
                }
                if (!pre) {
                  const raw = JSON.stringify(product || {});
                  const ok = await saveImportCache(cacheUrl, sha256(raw), { source: "shopify", url: cacheUrl, product, payload });
                  if (ok) await appendLog(userId, requestId, "info", `缓存写入完成 handle=${String(product.handle||"")}`);
                }
                await appendLog(userId, requestId, "info", `检查现有产品完成 handle=${String(product.handle||"")} 现有ID=${existing?.id || "无"}`);
                let resp: Response;
                
                // 事务跟踪：如果是更新操作，先保存原始产品数据用于回滚
                if (existing && existing.id) {
                  const tracker = getTransactionTracker(requestId);
                  if (!tracker.originalProducts.has(existing.id)) {
                    try {
                      const existingProductResp = await wooGet(dstCfg, `index.php/wp-json/wc/v3/products/${existing.id}`);
                      if (existingProductResp.ok) {
                        const existingProduct = await existingProductResp.json();
                        tracker.originalProducts.set(existing.id, existingProduct);
                      }
                    } catch (e) {
                      console.error("获取原始产品数据失败:", e);
                    }
                  }
                }
                
                if (existing) {
                  await appendLog(userId, requestId, "info", `开始更新现有产品 handle=${String(product.handle||"")} ID=${existing.id}`);
                  resp = await wooPut(dstCfg, `index.php/wp-json/wc/v3/products/${existing.id}`, payload);
                } else {
                  await appendLog(userId, requestId, "info", `开始创建新产品 handle=${String(product.handle||"")}`);
                  resp = await wooPost(dstCfg, `index.php/wp-json/wc/v3/products`, { ...payload, slug: product.handle });
                }
                const ct = resp.headers.get("content-type") || "";
                if (!resp.ok || !ct.includes("application/json")) {
                  const emsg = `WooCommerce API请求失败 handle=${String(product.handle||"")} 状态=${resp.status}`;
                  await appendLog(userId, requestId, "error", emsg);
                  // API请求失败时触发事务回滚
                  try {
                    await rollbackTransaction(requestId, dstCfg);
                    await appendLog(userId, requestId, "error", `WooCommerce API请求失败，已执行事务回滚 handle=${String(product.handle||"")}`);
                  } catch (rollbackError: unknown) {
                    const errorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError || "未知错误");
                    await appendLog(userId, requestId, "error", `事务回滚失败: ${errorMessage}`);
                  }
                  await recordResult(userId, "shopify", requestId, String(product.handle||""), (payload?.name as string | undefined), existing?.id, "error", emsg, existing ? "update" : "add");
                } else {
                  const saved = await resp.json().catch(()=>({})) as WooProduct;
                  
                  // 事务跟踪：记录成功创建或更新的产品
                  if (saved?.id) {
                    const tracker = getTransactionTracker(requestId);
                    if (existing) {
                      tracker.updatedProducts.push(saved.id);
                    } else {
                      tracker.createdProducts.push(saved.id);
                    }
                  }
                  
                  await appendLog(userId, requestId, "info", `WooCommerce产品${existing ? '更新' : '创建'}成功 handle=${String(product.handle||"")} ID=${saved?.id || "未知"}`);
                  if (Array.isArray(product.variants) && product.variants.length > 1 && typeof saved?.id === 'number') {
                    await appendLog(userId, requestId, "info", `开始处理变体 handle=${String(product.handle||"")} 变体数量=${product.variants.length}`);
                    for (const v of product.variants) {
                      const varPayload = buildVariationFromShopifyVariant(v);
                      await wooPost(dstCfg, `index.php/wp-json/wc/v3/products/${saved.id}/variations`, varPayload).then((r) => r.json());
                      await appendLog(userId, requestId, "info", `已创建变体 handle=${String(product.handle||"")} 变体SKU=${v.sku || "无"}`);
                    }
                    await appendLog(userId, requestId, "info", `所有变体处理完成 handle=${String(product.handle||"")}`);
                  }
                  await recordResult(userId, "shopify", requestId, String(product.handle||""), String((saved?.name || payload?.name) || ""), (typeof saved?.id === 'number' ? saved?.id : (typeof existing?.id === 'number' ? existing.id : undefined)), "success", undefined, existing ? "update" : "add");
                  await appendLog(userId, requestId, "info", `产品导入完成 handle=${String(product.handle||"")} ID=${saved?.id || existing?.id || "未知"}`);
                }
              }
            } else if (s === "wordpress") {
              const link = String(msg.link || "");
              await appendLog(userId, requestId, "info", `开始处理WordPress产品 link=${link}`);
              const cached = await getImportCache(link);
              const useCache = cached && isCacheValid(cached);
              if (cached) {
                if (useCache) await appendLog(userId, requestId, "info", `缓存命中 source=wordpress url=${link}`);
                else await appendLog(userId, requestId, "info", `缓存过期 source=wordpress url=${link}`);
              } else {
                await appendLog(userId, requestId, "info", `缓存未命中 source=wordpress url=${link}`);
              }
              let meta = await fetchHtmlMeta(link);
              const html = meta.html;
              await appendLog(userId, requestId, "info", `HTTP状态=${meta.status} CT=${meta.contentType}`);
              if (meta.status >= 400) {
                const emsg = `获取页面失败 HTTP ${meta.status}`;
                await appendLog(userId, requestId, "error", `${emsg} link=${link}`);
                const slugFail = normalizeWpSlugOrLink(link);
                await recordResult(userId, "wordpress", requestId, slugFail, undefined, undefined, "error", emsg, undefined);
                continue;
              }
              if (!meta.contentType.includes("text/html")) {
                const emsg = `页面类型非HTML: ${meta.contentType}`;
                await appendLog(userId, requestId, "error", `${emsg} link=${link}`);
                const slugFail = normalizeWpSlugOrLink(link);
                await recordResult(userId, "wordpress", requestId, slugFail, undefined, undefined, "error", emsg, undefined);
                continue;
              }
              
              // 检测并记录网址不匹配
              if (meta.urlMismatch && meta.finalUrl !== link) {
                await appendLog(userId, requestId, "info", `网址重定向检测: 原始URL=${link} 最终URL=${meta.finalUrl}`);
              }
              
              let slug = normalizeWpSlugOrLink(link);
              let sku = slug;
              let payload: WordPressProductPayload;
              let catNames: string[] = [];
              let tagNames: string[] = [];
              if (useCache) {
                const pre: WpCachePre = cached!.result_json as WpCachePre;
                slug = pre?.slug || slug;
                sku = pre?.sku || slug;
                const maxImages = parseInt(process.env.RUNNER_MAX_IMAGES_PER_PRODUCT || "10", 10) || 10;
                const imgs: string[] = Array.isArray(pre?.imagesAbs) ? pre.imagesAbs : [];
                payload = { name: pre?.name || slug, slug, sku, description: pre?.description || "", short_description: pre?.short_description || "", images: Array.from(new Set(imgs)).slice(0, maxImages).map((src) => ({ src })) };
                catNames = Array.isArray(pre?.catNames) ? pre.catNames : [];
                tagNames = Array.isArray(pre?.tagNames) ? pre.tagNames : [];
              } else {
                await appendLog(userId, requestId, "info", `获取HTML内容完成 link=${link} 长度=${html.length}`);
                const ldProbe = extractJsonLdProduct(html || "");
                const hasGallery = /woocommerce-product-gallery|wp-post-image/i.test(html || "");
                const hasMetaImg = /og:image|twitter:image/i.test(html || "");
                const hasForm = /variations_form|data-product_variations/i.test(html || "");
                if (!html || html.length < 512 || (!ldProbe && !hasGallery && !hasMetaImg && !hasForm)) {
                  const base = (new URL(link)).origin;
                  const slugGuess = normalizeWpSlugOrLink(link);
                  const candidates = [
                    `${base}/product/${slugGuess}/`,
                    `${base}/product/${slugGuess}`,
                    `${base}/shop/${slugGuess}/`,
                    `${base}/shop/${slugGuess}`,
                    `${base}/${slugGuess}/`,
                    `${base}/${slugGuess}`
                  ];
                  try { await appendLog(userId, requestId, "info", `WordPress fallback 开始 slug=${slugGuess} candidates=${candidates.length}`); } catch {}
                  let resolved = false;
                  for (const c of candidates) {
                    try {
                      const m2 = await fetchHtmlMeta(c);
                      const ldp = extractJsonLdProduct(m2.html || "");
                      const okHtml = (m2.contentType || "").includes("text/html") && m2.html && m2.html.length >= 512;
                      const okSig = /woocommerce-product-gallery|wp-post-image|variations_form|data-product_variations|og:image|twitter:image/i.test(m2.html || "");
                      if (okHtml && (ldp || okSig)) { meta = m2; resolved = true; try { await appendLog(userId, requestId, "info", `WordPress fallback 命中 url=${m2.finalUrl || c}`); } catch {}; break; }
                    } catch {}
                  }
                  if (!resolved) {
                    const emsg = `HTML内容过短，疑似防护或重定向，长度=${html.length}`;
                    await appendLog(userId, requestId, "error", `${emsg} link=${link}`);
                    const slugFail = normalizeWpSlugOrLink(link);
                    await recordResult(userId, "wordpress", requestId, slugFail, undefined, undefined, "error", emsg, undefined);
                    continue;
                  }
                }
                const built = buildWpPayloadFromHtml(html, link, meta.finalUrl || link);
                slug = built.slug;
                sku = built.sku;
                const abs = built.imagesAbs;
                const finalCats = built.catNames || [];
                const tags = built.tagNames || [];
                const descHtml = built.description || "";
                const cachedAbs = await cacheImagesToBucket(meta.finalUrl || link, Array.from(new Set(abs)), userId, requestId);
                const maxImages = parseInt(process.env.RUNNER_MAX_IMAGES_PER_PRODUCT || "10", 10) || 10;
                payload = { name: built.payload?.name || slug, slug, sku, description: descHtml, short_description: descHtml, images: Array.from(new Set(cachedAbs)).slice(0, maxImages).map((src) => ({ src })) };
                catNames = finalCats;
                tagNames = tags;
                const ok = await saveImportCache(meta.finalUrl || link, sha256(html || ""), { source: "wordpress", url: meta.finalUrl || link, slug, sku, name: payload.name, description: payload.description, short_description: payload.short_description, imagesAbs: Array.from(new Set(abs)), catNames, tagNames, payload });
                if (ok) await appendLog(userId, requestId, "info", `缓存写入完成 link=${meta.finalUrl || link}`);
              }
              await appendLog(userId, requestId, "info", `构建产品数据完成 link=${link} 名称=${payload.name}`);
              try {
                const prevAuth = process.env.WOO_AUTH_MODE;
                process.env.WOO_AUTH_MODE = "basic";
                let catTerms: Array<{ id: number }> = [];
                let tagTerms: Array<{ id: number }> = [];
                try {
                  catTerms = await ensureTermsCached(dstCfg, "category", catNames, requestId);
                  tagTerms = await ensureTermsCached(dstCfg, "tag", tagNames, requestId);
                } finally {
                  process.env.WOO_AUTH_MODE = prevAuth;
                }
                await appendLog(userId, requestId, "info", `准备分类和标签术语完成 link=${link}`);
                payload.categories = catTerms;
                payload.tags = tagTerms;
              } catch (e) {
                const emsg = e instanceof Error ? e.message : String(e || "术语准备失败");
                await appendLog(userId, requestId, "error", `术语准备失败 link=${link} err=${emsg}`);
                await recordResult(userId, "wordpress", requestId, slug, payload?.name, undefined, "error", emsg, undefined);
                continue;
              }
              let existing: WooProduct | null = null;
              try {
                existing = await findProductCached(dstCfg, sku, slug, requestId);
                await appendLog(userId, requestId, "info", `检查现有产品完成 link=${link} 现有ID=${existing?.id || "无"}`);
              } catch (e) {
                const emsg = e instanceof Error ? e.message : String(e || "检查现有产品失败");
                await appendLog(userId, requestId, "error", `检查现有产品失败 link=${link} err=${emsg}`);
                await recordResult(userId, "wordpress", requestId, slug, payload?.name, undefined, "error", emsg, undefined);
                continue;
              }
              let resp: Response | null = null;
              let curExisting: WooProduct | null = existing || null;
              try {
                if (curExisting) {
                  await appendLog(userId, requestId, "info", `开始更新现有产品 link=${link} ID=${curExisting.id}`);
                  resp = await wooPut(dstCfg, `index.php/wp-json/wc/v3/products/${curExisting.id}`, payload);
                } else {
                  await appendLog(userId, requestId, "info", `开始创建新产品 link=${link}`);
                  resp = await wooPost(dstCfg, `index.php/wp-json/wc/v3/products`, { ...payload, slug });
                }
              } catch {
                const ex2 = await findProductCached(dstCfg, sku, slug, requestId);
                if (ex2 && typeof ex2?.id === 'number') {
                  curExisting = ex2;
                  resp = await wooPut(dstCfg, `index.php/wp-json/wc/v3/products/${ex2.id}`, payload);
                } else {
                  const emsg = `WooCommerce API请求失败 link=${link}`;
                  await appendLog(userId, requestId, "error", emsg);
                  await recordResult(userId, "wordpress", requestId, slug, payload?.name, existing?.id, "error", emsg, curExisting ? "update" : "add");
                  continue;
                }
              }
                const ct = resp!.headers.get("content-type") || "";
                if (!resp!.ok || !ct.includes("application/json")) {
                const emsg = `WooCommerce API请求失败 link=${link} 状态=${resp.status}`;
                await appendLog(userId, requestId, "error", emsg);
                await recordResult(userId, "wordpress", requestId, slug, payload?.name, curExisting?.id, "error", emsg, curExisting ? "update" : "add");
              } else {
                const saved = await resp!.json().catch(()=>({})) as WooProduct;
                if (typeof saved?.id === 'number') {
                  try {
                    const vBuilt2 = buildWpVariationsFromHtml(html);
                    if (vBuilt2?.variations?.length) {
                      for (const v of vBuilt2.variations) {
                        try { await wooPost(dstCfg, `index.php/wp-json/wc/v3/products/${saved.id}/variations`, v, { userId, requestId, productHandle: slug }); } catch {}
                      }
                    }
                  } catch {}
                }
                const intended = Array.isArray(payload?.images) ? payload.images.length : 0;
                let imagesOk = true;
                if (intended > 0 && typeof saved?.id === 'number') {
                  try {
                    const remotes = (payload?.images || []).map((ii: { src: string }) => ii.src);
                    const maxImages = parseInt(process.env.RUNNER_MAX_IMAGES_PER_PRODUCT || "10", 10) || 10;
                    const toUpload = remotes.slice(0, maxImages);
                    const replaceImages = toUpload.map((src) => ({ src }));
                    const prevAuth = process.env.WOO_AUTH_MODE; process.env.WOO_AUTH_MODE = "basic";
                    const prevRetry = process.env.WOO_WRITE_RETRY; process.env.WOO_WRITE_RETRY = String(parseInt(process.env.IMAGE_UPLOAD_RETRY || "2", 10) || 2);
                    const prevTimeout = process.env.WOO_WRITE_TIMEOUT_MS; process.env.WOO_WRITE_TIMEOUT_MS = String(parseInt(process.env.IMAGE_WRITE_TIMEOUT_MS || process.env.IMAGE_FETCH_TIMEOUT_MS || "15000", 10) || 15000);
                    const up = await wooPut(dstCfg, `index.php/wp-json/wc/v3/products/${saved.id}`, { images: replaceImages });
                    process.env.WOO_AUTH_MODE = prevAuth; process.env.WOO_WRITE_RETRY = prevRetry; process.env.WOO_WRITE_TIMEOUT_MS = prevTimeout;
                    const ct2 = up.headers.get("content-type") || "";
                    if (up.ok && ct2.includes("application/json")) {
                      const j = await up.json().catch(()=>({}));
                      const afterCount = Array.isArray(j?.images) ? j.images.length : 0;
                      imagesOk = afterCount >= replaceImages.length;
                    } else {
                      imagesOk = false;
                    }
                  } catch { imagesOk = false; }
                }
                if (intended > 0 && !imagesOk) {
                  const emsg = `图片上传部分失败 link=${link}`;
                  await appendLog(userId, requestId, "info", emsg);
                  await recordResult(userId, "wordpress", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : curExisting?.id), "partial", emsg, curExisting ? "update" : "add");
                } else {
                  await appendLog(userId, requestId, "info", `WooCommerce产品${existing ? '更新' : '创建'}成功 link=${link} ID=${saved?.id || "未知"}`);
                  await recordResult(userId, "wordpress", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : curExisting?.id), "success", undefined, curExisting ? "update" : "add");
                  await appendLog(userId, requestId, "info", `产品导入完成 link=${link} ID=${saved?.id || curExisting?.id || "未知"}`);
                }
              }
            } else if (s === "wix") {
              const link = String(msg.link || "");
              await appendLog(userId, requestId, "info", `开始处理Wix产品 link=${link}`);
              const cached = await getImportCache(link);
              const useCache = cached && isCacheValid(cached);
              if (cached) {
                if (useCache) await appendLog(userId, requestId, "info", `缓存命中 source=wix url=${link}`);
                else await appendLog(userId, requestId, "info", `缓存过期 source=wix url=${link}`);
              } else {
                await appendLog(userId, requestId, "info", `缓存未命中 source=wix url=${link}`);
              }
              const meta = useCache ? { html: "", status: 200, contentType: "text/html", finalUrl: link, urlMismatch: false } : await fetchHtmlMeta(link);
              const html = meta.html;
              
              // 检测并记录网址不匹配
              if (meta.urlMismatch && meta.finalUrl !== link) {
                await appendLog(userId, requestId, "info", `网址重定向检测: 原始URL=${link} 最终URL=${meta.finalUrl}`);
              }
              
              const pre: WixCachePre | null = useCache ? (cached!.result_json as WixCachePre) : null;
              const slug = pre?.slug || normalizeWpSlugOrLink(link);
              let payload: WordPressProductPayload;
              let categories: string[] = [];
              let tags: string[] = [];
              if (useCache) {
                const maxImages2 = parseInt(process.env.RUNNER_MAX_IMAGES_PER_PRODUCT || "10", 10) || 10;
                const imgs: string[] = Array.isArray(pre?.imagesAbs) ? pre.imagesAbs : [];
                payload = { name: pre?.name || slug, slug, description: pre?.description || "", short_description: pre?.short_description || pre?.description || "", images: Array.from(new Set(imgs)).slice(0, maxImages2).map((src) => ({ src })) };
                categories = Array.isArray(pre?.catNames) ? pre.catNames as string[] : [];
                tags = Array.isArray(pre?.tagNames) ? pre.tagNames as string[] : [];
              } else {
                const builtW = buildWixPayload(link, html);
                payload = builtW.payload as WordPressProductPayload;
                categories = builtW.categories || [];
                tags = builtW.tags || [];
                const img = builtW.ld?.image as string | string[] | undefined;
                const abs2 = Array.isArray(img) ? img : (typeof img === 'string' ? [img] : (payload.images?.map((ii: { src: string }) => ii.src) || []));
                const ok = await saveImportCache(link, sha256(html || ""), { source: "wix", url: link, slug, name: payload.name, description: String(payload.description || ""), short_description: String(payload.short_description || ""), imagesAbs: Array.from(new Set(abs2)), catNames: categories, tagNames: tags, payload });
                if (ok) await appendLog(userId, requestId, "info", `缓存写入完成 link=${link}`);
              }
              await appendLog(userId, requestId, "info", `构建产品数据完成 link=${link} 名称=${payload.name}`);
              const existing = await findProductBySkuOrSlug(dstCfg, undefined, slug);
              await appendLog(userId, requestId, "info", `检查现有产品完成 link=${link} 现有ID=${existing?.id || "无"}`);
              let resp: Response;
              if (existing) {
                await appendLog(userId, requestId, "info", `开始更新现有产品 link=${link} ID=${existing.id}`);
                resp = await wooPut(dstCfg, `index.php/wp-json/wc/v3/products/${existing.id}`, payload);
              } else {
                await appendLog(userId, requestId, "info", `开始创建新产品 link=${link}`);
                resp = await wooPost(dstCfg, `index.php/wp-json/wc/v3/products`, { ...payload, slug });
              }
              const ct = resp.headers.get("content-type") || "";
              if (!resp.ok || !ct.includes("application/json")) {
                const emsg = `WooCommerce API请求失败 目标站点=${wordpressUrl} 源网址=${link} 状态=${resp.status}`;
                await appendLog(userId, requestId, "error", emsg);
                await recordResult(userId, "wix", requestId, slug, payload?.name, existing?.id, "error", emsg, existing ? "update" : "add");
              } else {
                const saved = await resp.json().catch(()=>({})) as WooProduct;
                await appendLog(userId, requestId, "info", `WooCommerce产品${existing ? '更新' : '创建'}成功 目标站点=${wordpressUrl} 源网址=${link} ID=${saved?.id || "未知"}`);
                if (typeof saved?.id === 'number') {
                  try {
                    let vBuiltW: { variations?: Array<Record<string, unknown>> } = {};
                    if (useCache) {
                      const attrs = (payload as Record<string, unknown>)?.attributes as Array<{ name: string; visible?: boolean; variation?: boolean; options: string[] }> | undefined;
                      if (attrs && attrs.length) {
                        const names = attrs.map(a => a.name);
                        const lists = attrs.map(a => a.options || []);
                        const variations: Array<{ attributes: Array<{ name: string; option: string }>; regular_price?: string }> = [];
                        const priceStr = String((payload as Record<string, unknown>)?.regular_price || (payload as Record<string, unknown>)?.price || "").trim();
                        function gen(namesIn: string[], listsIn: string[][], acc: Array<{ name: string; option: string }>) {
                          if (!namesIn.length) { const v: { attributes: Array<{ name: string; option: string }>; regular_price?: string } = { attributes: acc.slice() }; if (priceStr) v.regular_price = priceStr; variations.push(v); return; }
                          const [n, ...rn] = namesIn; const [ls, ...rl] = listsIn; for (const opt of ls) gen(rn, rl, [...acc, { name: n, option: opt }]);
                        }
                        gen(names, lists, []);
                        vBuiltW = { variations };
                      }
                    } else {
                      vBuiltW = buildWixVariationsFromHtml(html);
                    }
                    if (vBuiltW?.variations && vBuiltW.variations.length) {
                      for (const v of vBuiltW.variations) {
                        try { await wooPost(dstCfg, `index.php/wp-json/wc/v3/products/${saved.id}/variations`, v, { userId, requestId, productHandle: slug }); } catch {}
                      }
                    }
                  } catch {}
                }
                
                await recordResult(userId, "wix", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "success", undefined, existing ? "update" : "add");
                await appendLog(userId, requestId, "info", `产品导入完成 目标站点=${wordpressUrl} 源网址=${link} ID=${saved?.id || existing?.id || "未知"}`);
              }
            }
            try {
            await pgmqDelete(queueUsed, row.msg_id);
            try { await appendLog(userId, requestId, "info", `pgmq delete mid=${row.msg_id}`); } catch {}
          } catch (delErr: unknown) {
              const errorMessage = delErr instanceof Error ? delErr.message : String(delErr || "未知错误");
              try { await appendLog(userId, requestId, "error", `pgmqDelete failed mid=${row.msg_id} err=${errorMessage}`); } catch {}
              try { await pgmqArchive(queueUsed, row.msg_id); await appendLog(userId, requestId, "error", `pgmq archived mid=${row.msg_id} after delete failure`); } catch {}
            }
          } catch (e: unknown) {
            const maxRetry = parseInt(process.env.RUNNER_MAX_READ_RETRIES || "5", 10) || 5;
            if ((row.read_ct || 0) + 1 >= maxRetry) {
              await pgmqArchive(queueUsed, row.msg_id).catch(()=>{});
              try { await appendLog(userId, requestId, "error", `max retry reached mid=${row.msg_id} archived`); } catch {}
              // 在最大重试次数达到时执行事务回滚
              try {
                const dstCfg = {
                  url: cfg?.wordpress_url || "",
                  consumerKey: cfg?.consumer_key || "",
                  consumerSecret: cfg?.consumer_secret || ""
                };
                await rollbackTransaction(requestId, dstCfg);
                const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
                await appendLog(userId, requestId, "error", `获取原始产品数据失败: ${errorMessage}`);
                try {
                  const itemKeyRaw = String((msg && (msg.handle || msg.link)) || "");
                  const itemKey = itemKeyRaw ? normalizeWpSlugOrLink(itemKeyRaw) : itemKeyRaw;
                  await recordResult(userId, s, requestId, itemKey, undefined, undefined, "error", errorMessage);
                } catch {}
              } catch (rollbackError: unknown) {
                const rollbackErrorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError || "未知错误");
                await appendLog(userId, requestId, "error", `事务回滚失败: ${rollbackErrorMessage}`);
              }
          } else {
            // 退避与重试：最多3次，指数退避
            const maxRetry = parseInt(process.env.RUNNER_MAX_READ_RETRIES || "3", 10) || 3;
            if ((row.read_ct || 0) + 1 >= maxRetry) {
              await pgmqArchive(queueUsed, row.msg_id).catch(()=>{});
            } else {
              const newVt = vt * Math.min(8, Math.pow(2, (row.read_ct || 0) + 1));
              await pgmqSetVt(queueUsed, row.msg_id, newVt).catch(()=>{});
              try { await appendLog(userId, requestId, "error", `retry scheduled mid=${row.msg_id} new_vt=${newVt}`); } catch {}
            }
          }
            // 只在异常时记录日志，不写入import_results
          }
          
        }
        inFlightSources.delete(s);
    }
    
      return NextResponse.json({ ok: true, picked });
    }
    
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
