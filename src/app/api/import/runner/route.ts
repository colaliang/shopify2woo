import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken } from "@/lib/supabaseServer";
import { appendLog } from "@/lib/logs";
import { pgmqQueueName, pgmqRead, pgmqDelete, pgmqArchive, pgmqSetVt } from "@/lib/pgmq";
// import-jobs 相关逻辑已移除
import { recordResult } from "@/lib/history";
import { ensureTerms, findProductBySkuOrSlug, wooPost, wooPut, wooGet, wooDelete, type WooConfig } from "@/lib/woo";
import { fetchProductByHandle } from "@/lib/shopify";
import { buildWooProductPayload, buildVariationFromShopifyVariant } from "@/lib/importMap";
import { fetchHtmlMeta, extractJsonLdProduct, extractProductVariations, extractFormAttributes, extractProductPrice, buildVariationsFromForm, extractBreadcrumbCategories, extractPostedInCategories, extractTags, extractDescriptionHtml, extractGalleryImages, extractOgImages, extractContentImages, extractSku } from "@/lib/wordpressScrape";
import { normalizeWpSlugOrLink, type WooProduct } from "@/lib/wordpress";
const lastRunBySource = new Map<string, number>();
const inFlightSources = new Set<string>();

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
        await wooDelete(dstCfg, `wp-json/wc/v3/products/${productId}?force=true`, {
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
        await wooPut(dstCfg, `wp-json/wc/v3/products/${productId}`, originalData, {
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
    if (!supabase) return NextResponse.json({ error: "服务未配置" }, { status: 500 });
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
        
        for (const row of msgs) {
          const msg = (row.message || {}) as PgmqMessage;
          const userId = String(msg.userId || "");
          const requestId = String(msg.requestId || "");
          if (!userId || !requestId) { await pgmqArchive(queueUsed, row.msg_id).catch(()=>{}); continue; }
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
            await pgmqArchive(q, row.msg_id).catch(()=>{});
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
              let catTerms: any = [];
              let tagTerms: any = [];
              try {
                catTerms = await ensureTermsCached(dstCfg, "category", categories, requestId);
                tagTerms = await ensureTermsCached(dstCfg, "tag", tags, requestId);
                await appendLog(userId, requestId, "info", `准备分类与标签术语完成 handle=${String(msg.handle||"")}`);
              } catch (e) {
                const emsg = e instanceof Error ? e.message : String(e || "术语准备失败");
                await appendLog(userId, requestId, "error", `术语准备失败 handle=${String(msg.handle||"")} err=${emsg}`);
                await recordResult(userId, "shopify", requestId, String(msg.handle||""), undefined, undefined, "error", emsg);
                continue;
              }
              await appendLog(userId, requestId, "info", `已准备分类和标签术语 handle=${String(msg.handle||"")}`);
              const product = await fetchProductByHandle(String(msg.shopifyBaseUrl || ""), String(msg.handle || ""));
              if (!product) {
                const emsg = `not found handle=${String(msg.handle||"")}`;
                await appendLog(userId, requestId, "error", emsg);
                await recordResult(userId, "shopify", requestId, String(msg.handle||""), undefined, undefined, "error", emsg);
              } else {
                await appendLog(userId, requestId, "info", `获取到Shopify产品 handle=${String(product.handle||"")} 名称=${product.title||""}`);
                const payload = buildWooProductPayload(product);
                payload.categories = catTerms;
                payload.tags = tagTerms;
                await appendLog(userId, requestId, "info", `构建WooCommerce产品数据完成 handle=${String(product.handle||"")}`);
                let existing: WooProduct | null = null;
                try {
                  existing = await findProductCached(dstCfg, undefined, product.handle, requestId);
                } catch (e) {
                  const emsg = e instanceof Error ? e.message : String(e || "检查现有产品失败");
                  await appendLog(userId, requestId, "error", `检查现有产品失败 handle=${String(msg.handle||"")} err=${emsg}`);
                  await recordResult(userId, "shopify", requestId, String(msg.handle||""), undefined, undefined, "error", emsg);
                  continue;
                }
                await appendLog(userId, requestId, "info", `检查现有产品完成 handle=${String(product.handle||"")} 现有ID=${existing?.id || "无"}`);
                let resp: Response;
                
                // 事务跟踪：如果是更新操作，先保存原始产品数据用于回滚
                if (existing && existing.id) {
                  const tracker = getTransactionTracker(requestId);
                  if (!tracker.originalProducts.has(existing.id)) {
                    try {
                      const existingProductResp = await wooGet(dstCfg, `wp-json/wc/v3/products/${existing.id}`);
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
                  resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
                } else {
                  await appendLog(userId, requestId, "info", `开始创建新产品 handle=${String(product.handle||"")}`);
                  resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug: product.handle });
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
                  await recordResult(userId, "shopify", requestId, String(product.handle||""), (payload?.name as string | undefined), existing?.id, "error", emsg);
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
                      await wooPost(dstCfg, `wp-json/wc/v3/products/${saved.id}/variations`, varPayload).then((r) => r.json());
                      await appendLog(userId, requestId, "info", `已创建变体 handle=${String(product.handle||"")} 变体SKU=${v.sku || "无"}`);
                    }
                    await appendLog(userId, requestId, "info", `所有变体处理完成 handle=${String(product.handle||"")}`);
                  }
                  await recordResult(userId, "shopify", requestId, String(product.handle||""), String((saved?.name || payload?.name) || ""), (typeof saved?.id === 'number' ? saved?.id : (typeof existing?.id === 'number' ? existing.id : undefined)), "success");
                  await appendLog(userId, requestId, "info", `产品导入完成 handle=${String(product.handle||"")} ID=${saved?.id || existing?.id || "未知"}`);
                }
              }
            } else if (s === "wordpress") {
              const link = String(msg.link || "");
              await appendLog(userId, requestId, "info", `开始处理WordPress产品 link=${link}`);
              const meta = await fetchHtmlMeta(link);
              const html = meta.html;
              await appendLog(userId, requestId, "info", `HTTP状态=${meta.status} CT=${meta.contentType}`);
              if (meta.status >= 400) {
                const emsg = `获取页面失败 HTTP ${meta.status}`;
                await appendLog(userId, requestId, "error", `${emsg} link=${link}`);
                const slugFail = normalizeWpSlugOrLink(link);
                await recordResult(userId, "wordpress", requestId, slugFail, undefined, undefined, "error", emsg);
                continue;
              }
              if (!meta.contentType.includes("text/html")) {
                const emsg = `页面类型非HTML: ${meta.contentType}`;
                await appendLog(userId, requestId, "error", `${emsg} link=${link}`);
                const slugFail = normalizeWpSlugOrLink(link);
                await recordResult(userId, "wordpress", requestId, slugFail, undefined, undefined, "error", emsg);
                continue;
              }
              
              // 检测并记录网址不匹配
              if (meta.urlMismatch && meta.finalUrl !== link) {
                await appendLog(userId, requestId, "info", `网址重定向检测: 原始URL=${link} 最终URL=${meta.finalUrl}`);
              }
              
              await appendLog(userId, requestId, "info", `获取HTML内容完成 link=${link} 长度=${html.length}`);
              if (!html || html.length < 512) {
                const emsg = `HTML内容过短，疑似防护或重定向，长度=${html.length}`;
                await appendLog(userId, requestId, "error", `${emsg} link=${link}`);
                const slugFail = normalizeWpSlugOrLink(link);
                await recordResult(userId, "wordpress", requestId, slugFail, undefined, undefined, "error", emsg);
                continue;
              }
              const ld = extractJsonLdProduct(html);
              await appendLog(userId, requestId, "info", `提取JSON-LD数据完成 link=${link} 产品名称=${ld?.name || "无"}`);
              let vars = extractProductVariations(html);
              await appendLog(userId, requestId, "info", `提取变体信息完成 link=${link} 变体数量=${vars.length}`);
              if (!vars.length) {
                const attrs = extractFormAttributes(html);
                const price = extractProductPrice(html);
                vars = buildVariationsFromForm(attrs, price);
                await appendLog(userId, requestId, "info", `从表单构建变体完成 link=${link} 新变体数量=${vars.length}`);
              }
              const breadcrumbCats = extractBreadcrumbCategories(html);
              const postedCats = extractPostedInCategories(html);
              const cat = ld?.category;
              const fromLd = Array.isArray(cat) ? cat : cat ? [cat] : [];
              const allCats = Array.from(new Set([...(breadcrumbCats || []), ...(postedCats || []), ...fromLd].map((x) => String(x).trim()).filter(Boolean)));
              await appendLog(userId, requestId, "info", `提取分类信息完成 link=${link} 分类数量=${allCats.length}`);
              const tags = extractTags(html);
              await appendLog(userId, requestId, "info", `提取标签信息完成 link=${link} 标签数量=${tags.length}`);
              const slug = normalizeWpSlugOrLink(link);
              await appendLog(userId, requestId, "info", `生成slug完成 link=${link} slug=${slug}`);
              const sku = extractSku(html) || ld?.sku || slug;
              await appendLog(userId, requestId, "info", `提取SKU完成 link=${link} SKU=${sku}`);
              let images = extractGalleryImages(html);
              await appendLog(userId, requestId, "info", `提取图库图片完成 link=${link} 图片数量=${images.length}`);
              if (!images.length) {
                const ogs = extractOgImages(html);
                const contents = extractContentImages(html);
                images = Array.from(new Set([...(ogs || []), ...(contents || [])]));
                await appendLog(userId, requestId, "info", `从OG和内容图片补充完成 link=${link} 总图片数量=${images.length}`);
              }
              const descHtml = extractDescriptionHtml(html) || ld?.description;
              await appendLog(userId, requestId, "info", `提取描述完成 link=${link} 描述长度=${descHtml?.length || 0}`);
              const payload: WordPressProductPayload = { name: ld?.name || slug, slug, sku, description: descHtml || "", short_description: descHtml || "", images: images.map((u) => ({ src: new URL(u, meta.finalUrl || link).toString() })) };
              await appendLog(userId, requestId, "info", `构建产品数据完成 link=${link} 名称=${payload.name}`);
              try {
                const catTerms = await ensureTermsCached(dstCfg, "category", allCats, requestId);
                const tagTerms = await ensureTermsCached(dstCfg, "tag", tags, requestId);
                await appendLog(userId, requestId, "info", `准备分类和标签术语完成 link=${link}`);
                payload.categories = catTerms;
                payload.tags = tagTerms;
              } catch (e) {
                const emsg = e instanceof Error ? e.message : String(e || "术语准备失败");
                await appendLog(userId, requestId, "error", `术语准备失败 link=${link} err=${emsg}`);
                await recordResult(userId, "wordpress", requestId, slug, payload?.name, undefined, "error", emsg);
                continue;
              }
              let existing: WooProduct | null = null;
              try {
                existing = await findProductCached(dstCfg, sku, slug, requestId);
                await appendLog(userId, requestId, "info", `检查现有产品完成 link=${link} 现有ID=${existing?.id || "无"}`);
              } catch (e) {
                const emsg = e instanceof Error ? e.message : String(e || "检查现有产品失败");
                await appendLog(userId, requestId, "error", `检查现有产品失败 link=${link} err=${emsg}`);
                await recordResult(userId, "wordpress", requestId, slug, payload?.name, undefined, "error", emsg);
                continue;
              }
              let resp: Response;
              if (existing) {
                await appendLog(userId, requestId, "info", `开始更新现有产品 link=${link} ID=${existing.id}`);
                resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
              } else {
                await appendLog(userId, requestId, "info", `开始创建新产品 link=${link}`);
                resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug });
              }
              const ct = resp.headers.get("content-type") || "";
              if (!resp.ok || !ct.includes("application/json")) {
                const emsg = `WooCommerce API请求失败 link=${link} 状态=${resp.status}`;
                await appendLog(userId, requestId, "error", emsg);
                await recordResult(userId, "wordpress", requestId, slug, payload?.name, existing?.id, "error", emsg);
              } else {
                const saved = await resp.json().catch(()=>({})) as WooProduct;
                await appendLog(userId, requestId, "info", `WooCommerce产品${existing ? '更新' : '创建'}成功 link=${link} ID=${saved?.id || "未知"}`);
                
                await recordResult(userId, "wordpress", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "success");
                await appendLog(userId, requestId, "info", `产品导入完成 link=${link} ID=${saved?.id || existing?.id || "未知"}`);
              }
            } else if (s === "wix") {
              const link = String(msg.link || "");
              await appendLog(userId, requestId, "info", `开始处理Wix产品 link=${link}`);
              const meta = await fetchHtmlMeta(link);
              const html = meta.html;
              
              // 检测并记录网址不匹配
              if (meta.urlMismatch && meta.finalUrl !== link) {
                await appendLog(userId, requestId, "info", `网址重定向检测: 原始URL=${link} 最终URL=${meta.finalUrl}`);
              }
              
              await appendLog(userId, requestId, "info", `获取HTML内容完成 link=${link} 长度=${html.length}`);
              const ld = extractJsonLdProduct(html);
              await appendLog(userId, requestId, "info", `提取JSON-LD数据完成 link=${link} 产品名称=${ld?.name || "无"}`);
              const slug = normalizeWpSlugOrLink(link);
              await appendLog(userId, requestId, "info", `生成slug完成 link=${link} slug=${slug}`);
              const descHtml = extractDescriptionHtml(html) || ld?.description || "";
              await appendLog(userId, requestId, "info", `提取描述完成 link=${link} 描述长度=${descHtml.length}`);
              let images = extractGalleryImages(html);
              await appendLog(userId, requestId, "info", `提取图库图片完成 link=${link} 图片数量=${images.length}`);
              if (!images.length) {
                const ogs = extractOgImages(html);
                const contents = extractContentImages(html);
                images = Array.from(new Set([...(ogs || []), ...(contents || [])]));
                await appendLog(userId, requestId, "info", `从OG和内容图片补充完成 link=${link} 总图片数量=${images.length}`);
              }
              const payload: WordPressProductPayload = { name: ld?.name || slug, slug, description: descHtml, short_description: descHtml, images: images.map((u) => ({ src: new URL(u, meta.finalUrl || link).toString() })) };
              await appendLog(userId, requestId, "info", `构建产品数据完成 link=${link} 名称=${payload.name}`);
              const existing = await findProductBySkuOrSlug(dstCfg, undefined, slug);
              await appendLog(userId, requestId, "info", `检查现有产品完成 link=${link} 现有ID=${existing?.id || "无"}`);
              let resp: Response;
              if (existing) {
                await appendLog(userId, requestId, "info", `开始更新现有产品 link=${link} ID=${existing.id}`);
                resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
              } else {
                await appendLog(userId, requestId, "info", `开始创建新产品 link=${link}`);
                resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug });
              }
              const ct = resp.headers.get("content-type") || "";
              if (!resp.ok || !ct.includes("application/json")) {
                const emsg = `WooCommerce API请求失败 目标站点=${wordpressUrl} 源网址=${link} 状态=${resp.status}`;
                await appendLog(userId, requestId, "error", emsg);
                await recordResult(userId, "wix", requestId, slug, payload?.name, existing?.id, "error", emsg);
              } else {
                const saved = await resp.json().catch(()=>({})) as WooProduct;
                await appendLog(userId, requestId, "info", `WooCommerce产品${existing ? '更新' : '创建'}成功 目标站点=${wordpressUrl} 源网址=${link} ID=${saved?.id || "未知"}`);
                
                await recordResult(userId, "wix", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "success");
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
