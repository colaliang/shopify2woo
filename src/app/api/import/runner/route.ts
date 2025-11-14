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

async function authorize(req: Request) {
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

async function updateJob(userId: string, requestId: string, updates: { processed?: number; success?: number }) {
  const supabase = getSupabaseServer();
  if (!supabase) return;
  try {
    await supabase
      .from("import_jobs")
      .update(updates)
      .eq("request_id", requestId)
      .eq("user_id", userId);
  } catch (e) {
    console.error("updateJob failed:", e);
  }
}

async function finishJob(userId: string, requestId: string, status: "done" | "error") {
  const supabase = getSupabaseServer();
  if (!supabase) return;
  try {
    await supabase
      .from("import_jobs")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("request_id", requestId)
      .eq("user_id", userId);
  } catch (e) {
    console.error("finishJob failed:", e);
  }
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
    if (process.env.USE_PGMQ === "1") {
      const sources = src ? [src] : ["shopify", "wordpress", "wix"];
      let picked = 0;
      for (const s of sources) {
        const q = pgmqQueueName(s);
        const vt = parseInt(process.env.RUNNER_VT_SECONDS || "60", 10) || 60;
        const msgs = await pgmqRead(q, vt, batchSizeEnv);
        picked += msgs.length;
        const byReq = new Map<string, string>();
        for (const row of msgs) {
          const msg = (row.message || {}) as PgmqMessage;
          const userId = String(msg.userId || "");
          const requestId = String(msg.requestId || "");
          if (!userId || !requestId) { await pgmqArchive(q, row.msg_id).catch(()=>{}); continue; }
          try { await appendLog(userId, requestId, "info", `cfg maxJobs=${maxJobs} batchSize=${batchSizeEnv}`); } catch {}
          try { await appendLog(userId, requestId, "info", `begin source=${s} mid=${row.msg_id}`); } catch {}
          const { data: cfg } = await supabase
            .from("user_configs")
            .select("wordpress_url, consumer_key, consumer_secret")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();
          const jobRow = await supabase
            .from("import_jobs")
            .select("status")
            .eq("request_id", requestId)
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();
          try { await appendLog(userId, requestId, "info", `queue=${q} vt=${vt} msg_id=${row.msg_id} read_ct=${row.read_ct||0} status=${(jobRow?.data?.status)||"unknown"} wpUrl=${(cfg?.wordpress_url)?"set":"empty"} key=${(cfg?.consumer_key)?"set":"empty"} secret=${(cfg?.consumer_secret)?"set":"empty"}`); } catch {}
          if (jobRow?.data?.status === "canceled") {
            await pgmqDelete(q, row.msg_id).catch(()=>{});
            continue;
          }
          if (jobRow?.data?.status === "queued") {
            try {
              await supabase
                .from("import_jobs")
                .update({ status: "running", updated_at: new Date().toISOString() })
                .eq("request_id", requestId)
                .eq("user_id", userId);
              try { await appendLog(userId, requestId, "info", "set job running"); } catch {}
            } catch {}
          }
          const wordpressUrl = cfg?.wordpress_url || "";
          const consumerKey = cfg?.consumer_key || "";
          const consumerSecret = cfg?.consumer_secret || "";
          if (!wordpressUrl || !consumerKey || !consumerSecret) {
            await appendLog(userId, requestId, "error", "目标站 Woo 配置未设置");
            await pgmqArchive(q, row.msg_id).catch(()=>{});
            await finishJob(userId, requestId, "error").catch(()=>{});
            continue;
          }
          
          // 网址验证机制：检查WordPress网址格式是否正确
          try {
            const wpUrlObj = new URL(wordpressUrl);
            if (!wpUrlObj.protocol.startsWith('http')) {
              await appendLog(userId, requestId, "error", `WordPress网址协议无效: ${wordpressUrl}`);
              await pgmqArchive(q, row.msg_id).catch(()=>{});
              await finishJob(userId, requestId, "error").catch(()=>{});
              continue;
            }
          } catch {
            await appendLog(userId, requestId, "error", `WordPress网址格式无效: ${wordpressUrl}`);
            await pgmqArchive(q, row.msg_id).catch(()=>{});
            await finishJob(userId, requestId, "error").catch(()=>{});
            continue;
          }
          const dstCfg = { url: wordpressUrl, consumerKey, consumerSecret };
          try {
            if (s === "shopify") {
              const categories: string[] = Array.isArray(msg.categories) ? msg.categories : [];
              const tags: string[] = Array.isArray(msg.tags) ? msg.tags : [];
              await appendLog(userId, requestId, "info", `开始处理Shopify产品 handle=${String(msg.handle||"")} 分类=${categories.length} 标签=${tags.length}`);
              const catTerms = await ensureTerms(dstCfg, "category", categories);
              const tagTerms = await ensureTerms(dstCfg, "tag", tags);
              await appendLog(userId, requestId, "info", `已准备分类和标签术语 handle=${String(msg.handle||"")}`);
              const product = await fetchProductByHandle(String(msg.shopifyBaseUrl || ""), String(msg.handle || ""));
              if (!product) {
                await appendLog(userId, requestId, "error", `not found handle=${String(msg.handle||"")}`);
                // 只在失败时记录日志，不写入import_results
              } else {
                await appendLog(userId, requestId, "info", `获取到Shopify产品 handle=${String(product.handle||"")} 名称=${product.title||""}`);
                const payload = buildWooProductPayload(product);
                payload.categories = catTerms;
                payload.tags = tagTerms;
                await appendLog(userId, requestId, "info", `构建WooCommerce产品数据完成 handle=${String(product.handle||"")}`);
                const existing = await findProductBySkuOrSlug(dstCfg, undefined, product.handle);
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
                  await appendLog(userId, requestId, "error", `WooCommerce API请求失败 handle=${String(product.handle||"")} 状态=${resp.status}`);
                  // API请求失败时触发事务回滚
                  try {
                    await rollbackTransaction(requestId, dstCfg);
                    await appendLog(userId, requestId, "error", `WooCommerce API请求失败，已执行事务回滚 handle=${String(product.handle||"")}`);
                  } catch (rollbackError: unknown) {
                    const errorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError || "未知错误");
                    await appendLog(userId, requestId, "error", `事务回滚失败: ${errorMessage}`);
                  }
                  // 只在失败时记录日志，不写入import_results
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
              
              // 检测并记录网址不匹配
              if (meta.urlMismatch && meta.finalUrl !== link) {
                await appendLog(userId, requestId, "info", `网址重定向检测: 原始URL=${link} 最终URL=${meta.finalUrl}`);
              }
              
              await appendLog(userId, requestId, "info", `获取HTML内容完成 link=${link} 长度=${html.length}`);
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
              const catTerms = await ensureTerms(dstCfg, "category", allCats);
              const tagTerms = await ensureTerms(dstCfg, "tag", tags);
              await appendLog(userId, requestId, "info", `准备分类和标签术语完成 link=${link}`);
              payload.categories = catTerms;
              payload.tags = tagTerms;
              const existing = await findProductBySkuOrSlug(dstCfg, sku, slug);
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
                await appendLog(userId, requestId, "error", `WooCommerce API请求失败 link=${link} 状态=${resp.status}`);
                // 只在失败时记录日志，不写入import_results
              } else {
                const saved = await resp.json().catch(()=>({})) as WooProduct;
                await appendLog(userId, requestId, "info", `WooCommerce产品${existing ? '更新' : '创建'}成功 link=${link} ID=${saved?.id || "未知"}`);
                await updateJob(userId, requestId, { processed: 1, success: 1 });
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
                await appendLog(userId, requestId, "error", `WooCommerce API请求失败 目标站点=${wordpressUrl} 源网址=${link} 状态=${resp.status}`);
                // 只在失败时记录日志，不写入import_results
              } else {
                const saved = await resp.json().catch(()=>({})) as WooProduct;
                await appendLog(userId, requestId, "info", `WooCommerce产品${existing ? '更新' : '创建'}成功 目标站点=${wordpressUrl} 源网址=${link} ID=${saved?.id || "未知"}`);
                await updateJob(userId, requestId, { processed: 1, success: 1 });
                await recordResult(userId, "wix", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "success");
                await appendLog(userId, requestId, "info", `产品导入完成 目标站点=${wordpressUrl} 源网址=${link} ID=${saved?.id || existing?.id || "未知"}`);
              }
            }
            try {
              await pgmqDelete(q, row.msg_id);
              try { await appendLog(userId, requestId, "info", `pgmq delete mid=${row.msg_id}`); } catch {}
            } catch (delErr: unknown) {
              const errorMessage = delErr instanceof Error ? delErr.message : String(delErr || "未知错误");
              try { await appendLog(userId, requestId, "error", `pgmqDelete failed mid=${row.msg_id} err=${errorMessage}`); } catch {}
              try { await pgmqArchive(q, row.msg_id); } catch {}
            }
          } catch (e: unknown) {
            const maxRetry = parseInt(process.env.RUNNER_MAX_READ_RETRIES || "5", 10) || 5;
            if ((row.read_ct || 0) + 1 >= maxRetry) {
              await pgmqArchive(q, row.msg_id).catch(()=>{});
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
              } catch (rollbackError: unknown) {
                const rollbackErrorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError || "未知错误");
              await appendLog(userId, requestId, "error", `事务回滚失败: ${rollbackErrorMessage}`);
              }
              await finishJob(userId, requestId, "error");
            } else {
              await pgmqSetVt(q, row.msg_id, vt * Math.min(10, (row.read_ct || 0) + 1)).catch(()=>{});
            }
            // 只在异常时记录日志，不写入import_results
          }
          byReq.set(requestId, userId);
        }
        for (const [rid, uid] of byReq.entries()) {
          const { data: j2 } = await supabase
            .from("import_jobs")
            .select("total,processed")
            .eq("request_id", rid)
            .limit(1)
            .maybeSingle();
          const done = (j2?.processed || 0) >= (j2?.total || 0);
          if (done) await finishJob(uid, rid, "done");
        }
    }
      if (picked === 0 && process.env.RUNNER_STRICT_PGMQ !== "1") {
        let q2 = supabase
          .from("import_jobs")
          .select("request_id,user_id,source,total,processed,status,params,created_at")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(maxJobs);
        if (src) q2 = q2.eq("source", src);
        const { data: jobs2 } = await q2;
        if (jobs2 && jobs2.length) {
          let handled2 = 0;
          for (const job of jobs2) {
            const { data: claimed } = await supabase
              .from("import_jobs")
              .update({ status: "running", updated_at: new Date().toISOString() })
              .eq("request_id", job.request_id)
              .eq("status", "queued")
              .select("request_id,user_id,source,total,processed,params")
              .maybeSingle();
            if (!claimed) continue;
            handled2++;
            const requestId: string = claimed.request_id;
            const userId: string = claimed.user_id;
            const source: string = claimed.source;
            const total: number = claimed.total || 0;
            const processed: number = claimed.processed || 0;
            const params = typeof claimed.params === "string" ? JSON.parse(claimed.params) : claimed.params || {};
            try { await appendLog(userId, requestId, "info", `cfg maxJobs=${maxJobs} batchSize=${batchSizeEnv}`); } catch {}
            const { data: cfg } = await supabase
              .from("user_configs")
              .select("wordpress_url, consumer_key, consumer_secret")
              .eq("user_id", userId)
              .limit(1)
              .maybeSingle();
            const wordpressUrl = cfg?.wordpress_url || "";
            const consumerKey = cfg?.consumer_key || "";
            const consumerSecret = cfg?.consumer_secret || "";
            if (!wordpressUrl || !consumerKey || !consumerSecret) {
              await appendLog(userId, requestId, "error", "目标站 Woo 配置未设置");
              await finishJob(userId, requestId, "error");
              continue;
            }
            const dstCfg = { url: wordpressUrl, consumerKey, consumerSecret };
            const batchSize = batchSizeEnv;
            if (source === "shopify") {
              const shopifyBaseUrl: string = params.shopifyBaseUrl || "";
              const allHandles: string[] = params.handles || [];
              const start = processed;
              const slice = allHandles.slice(start, start + batchSize);
              const categories: string[] = params.categories || [];
              const tags: string[] = params.tags || [];
              const catTerms = await ensureTerms(dstCfg, "category", categories);
              const tagTerms = await ensureTerms(dstCfg, "tag", tags);
              await appendLog(userId, requestId, "info", `start batch ${start + 1}-${start + slice.length} of ${total}`);
              for (const handle of slice) {
                try {
                  await appendLog(userId, requestId, "info", `fetch product handle=${handle}`);
                  const product = await fetchProductByHandle(shopifyBaseUrl, handle);
                  if (!product) { await updateJob(userId, requestId, { processed: 1 }); continue; }
                  const payload = buildWooProductPayload(product);
                  payload.categories = catTerms;
                  payload.tags = tagTerms;
                  const existing = await findProductBySkuOrSlug(dstCfg, undefined, product.handle);
                  let saved: { id?: number; name?: string } = {};
                  if (existing) saved = await (await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload)).json();
                  else saved = await (await wooPost(dstCfg, "wp-json/wc/v3/products", { ...payload, slug: product.handle })).json();
                  if (Array.isArray(product.variants) && product.variants.length > 1) {
                    for (const v of product.variants) {
                      const varPayload = buildVariationFromShopifyVariant(v);
                      await wooPost(dstCfg, `wp-json/wc/v3/products/${saved.id}/variations`, varPayload).then((r) => r.json());
                    }
                  }
                  await updateJob(userId, requestId, { processed: 1, success: 1 });
                  await recordResult(userId, "shopify", requestId, String(product.handle||""), String(saved?.name || ""), (typeof saved?.id === 'number' ? saved?.id : undefined), "success");
                } catch (e: unknown) {
                  const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
                  await appendLog(userId, requestId, "error", `job error ${errorMessage}`);
                  // 执行事务回滚
                  try {
                    await rollbackTransaction(requestId, dstCfg);
                    const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
                  await appendLog(userId, requestId, "error", `导入失败: ${errorMessage}`);
                  } catch (rollbackError: unknown) {
                const errorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError || "未知错误");
                await appendLog(userId, requestId, "error", `事务回滚失败: ${errorMessage}`);
              }
                  await updateJob(userId, requestId, { processed: 1 });
                }
              }
            } else if (source === "wordpress") {
              const links: string[] = params.links || [];
              const start = processed;
              const slice = links.slice(start, start + batchSize);
              await appendLog(userId, requestId, "info", `start batch ${start + 1}-${start + slice.length} of ${total}`);
              for (const link of slice) {
                try {
                  const meta = await fetchHtmlMeta(link);
                  const html = meta.html;
                  
                  // 检测并记录网址不匹配
                  if (meta.urlMismatch && meta.finalUrl !== link) {
                    await appendLog(userId, requestId, "info", `网址重定向检测: 原始URL=${link} 最终URL=${meta.finalUrl}`);
                  }
                  
                  const ld = extractJsonLdProduct(html);
                  let vars = extractProductVariations(html);
                  if (!vars.length) {
                    const attrs = extractFormAttributes(html);
                    const price = extractProductPrice(html);
                    vars = buildVariationsFromForm(attrs, price);
                  }
                  const breadcrumbCats = extractBreadcrumbCategories(html);
                  const postedCats = extractPostedInCategories(html);
                  const cat = ld?.category;
                  const fromLd = Array.isArray(cat) ? cat : cat ? [cat] : [];
                  const allCats = Array.from(new Set([...(breadcrumbCats || []), ...(postedCats || []), ...fromLd].map((x) => String(x).trim()).filter(Boolean)));
                  const tags = extractTags(html);
                  const slug = normalizeWpSlugOrLink(link);
                  const sku = extractSku(html) || ld?.sku || slug;
                  let images = extractGalleryImages(html);
                  if (!images.length) {
                    const ogs = extractOgImages(html);
                    const contents = extractContentImages(html);
                    images = Array.from(new Set([...(ogs || []), ...(contents || [])]));
                  }
                  const descHtml = extractDescriptionHtml(html) || ld?.description;
                  const payload: WordPressProductPayload = { name: ld?.name || slug, slug, sku, description: descHtml || "", short_description: descHtml || "", images: images.map((u) => ({ src: new URL(u, meta.finalUrl || link).toString() })) };
                  const catTerms = await ensureTerms(dstCfg, "category", allCats);
                  const tagTerms = await ensureTerms(dstCfg, "tag", tags);
                  payload.categories = catTerms;
                  payload.tags = tagTerms;
                  const existing = await findProductBySkuOrSlug(dstCfg, sku, slug);
                  let resp: Response;
                  if (existing) resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
                  else resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug });
                  const ct = resp.headers.get("content-type") || "";
                  if (!resp.ok || !ct.includes("application/json")) { await updateJob(userId, requestId, { processed: 1 }); continue; }
                  const saved = await resp.json().catch(() => ({})) as WooProduct;
                  await updateJob(userId, requestId, { processed: 1, success: 1 });
                  await recordResult(userId, "wordpress", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "success");
                } catch (e: unknown) {
                  const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
            await appendLog(userId, requestId, "error", `job error ${errorMessage}`);
                  // 执行事务回滚
                  try {
                    await rollbackTransaction(requestId, dstCfg);
                    const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
                  await appendLog(userId, requestId, "error", `导入失败: ${errorMessage}`);
                  } catch (rollbackError: unknown) {
                    const errorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError || "未知错误");
                    await appendLog(userId, requestId, "error", `事务回滚失败: ${errorMessage}`);
                  }
                  await updateJob(userId, requestId, { processed: 1 });
                }
              }
            } else if (source === "wix") {
              const links: string[] = params.links || [];
              const start = processed;
              const slice = links.slice(start, start + batchSize);
              await appendLog(userId, requestId, "info", `start batch ${start + 1}-${start + slice.length} of ${total}`);
              for (const link of slice) {
                try {
                  const meta = await fetchHtmlMeta(link);
                  const html = meta.html;
                  
                  // 检测并记录网址不匹配
                  if (meta.urlMismatch && meta.finalUrl !== link) {
                    await appendLog(userId, requestId, "info", `网址重定向检测: 原始URL=${link} 最终URL=${meta.finalUrl}`);
                  }
                  
                  const ld = extractJsonLdProduct(html);
                  const slug = normalizeWpSlugOrLink(link);
                  const descHtml = extractDescriptionHtml(html) || ld?.description || "";
                  let images = extractGalleryImages(html);
                  if (!images.length) {
                    const ogs = extractOgImages(html);
                    const contents = extractContentImages(html);
                    images = Array.from(new Set([...(ogs || []), ...(contents || [])]));
                  }
                  const payload: WordPressProductPayload = { name: ld?.name || slug, slug, description: descHtml, short_description: descHtml, images: images.map((u) => ({ src: new URL(u, meta.finalUrl || link).toString() })) };
                  const existing = await findProductBySkuOrSlug(dstCfg, undefined, slug);
                  let resp: Response;
                  if (existing) resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
                  else resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug });
                  const ct = resp.headers.get("content-type") || "";
                  if (!resp.ok || !ct.includes("application/json")) { await updateJob(userId, requestId, { processed: 1 }); continue; }
                  const saved = await resp.json().catch(() => ({})) as WooProduct;
                  await updateJob(userId, requestId, { processed: 1, success: 1 });
                  await recordResult(userId, "wix", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "success");
                } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
            await appendLog(userId, requestId, "error", `job error ${errorMessage}`);
            // 执行事务回滚
            try {
              await rollbackTransaction(requestId, dstCfg);
              const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
            await appendLog(userId, requestId, "error", `导入失败: ${errorMessage}`);
            } catch (rollbackError: unknown) {
              const rollbackErrorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError || "未知错误");
              await appendLog(userId, requestId, "error", `事务回滚失败: ${rollbackErrorMessage}`);
            }
            await updateJob(userId, requestId, { processed: 1 });
                }
              }
            }
            const { data: j2 } = await supabase
              .from("import_jobs")
              .select("total,processed")
              .eq("request_id", requestId)
              .limit(1)
              .maybeSingle();
            const done = (j2?.processed || 0) >= (j2?.total || 0);
            if (done) await finishJob(userId, requestId, "done");
            else await supabase.from("import_jobs").update({ status: "queued", updated_at: new Date().toISOString() }).eq("request_id", requestId);
          }
          return NextResponse.json({ ok: true, picked: handled2 });
        }
      }
      return NextResponse.json({ ok: true, picked });
    }
    let q = supabase
      .from("import_jobs")
      .select("request_id,user_id,source,total,processed,status,params,created_at")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(maxJobs);
    if (src) q = q.eq("source", src);
    const { data: jobs } = await q;
    if (!jobs || !jobs.length) return NextResponse.json({ ok: true, picked: 0 });

    let handled = 0;
    for (const job of jobs) {
      const { data: claimed } = await supabase
        .from("import_jobs")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("request_id", job.request_id)
        .eq("status", "queued")
        .select("request_id,user_id,source,total,processed,params")
        .maybeSingle();
      if (!claimed) continue;
      handled++;
      const requestId: string = claimed.request_id;
      const userId: string = claimed.user_id;
      const source: string = claimed.source;
      const total: number = claimed.total || 0;
      const processed: number = claimed.processed || 0;
      const params = typeof claimed.params === "string" ? JSON.parse(claimed.params) : claimed.params || {};

      try { await appendLog(userId, requestId, "info", `cfg maxJobs=${maxJobs} batchSize=${batchSizeEnv}`); } catch {}

      const { data: cfg } = await supabase
        .from("user_configs")
        .select("wordpress_url, consumer_key, consumer_secret")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      try { await appendLog(userId, requestId, "info", `source=${source} status=running total=${total} processed=${processed} wpUrl=${(cfg?.wordpress_url)?"set":"empty"} key=${(cfg?.consumer_key)?"set":"empty"} secret=${(cfg?.consumer_secret)?"set":"empty"}`); } catch {}
      const wordpressUrl = cfg?.wordpress_url || "";
      const consumerKey = cfg?.consumer_key || "";
      const consumerSecret = cfg?.consumer_secret || "";
      if (!wordpressUrl || !consumerKey || !consumerSecret) {
        await appendLog(userId, requestId, "error", "目标站 Woo 配置未设置");
        await finishJob(userId, requestId, "error");
        continue;
      }
      const dstCfg = { url: wordpressUrl, consumerKey, consumerSecret };

      const batchSize = batchSizeEnv;
      if (source === "shopify") {
        const shopifyBaseUrl: string = params.shopifyBaseUrl || "";
        const allHandles: string[] = params.handles || [];
        const start = processed;
        const slice = allHandles.slice(start, start + batchSize);
        const categories: string[] = params.categories || [];
        const tags: string[] = params.tags || [];
        const catTerms = await ensureTerms(dstCfg, "category", categories);
        const tagTerms = await ensureTerms(dstCfg, "tag", tags);
        await appendLog(userId, requestId, "info", `start batch ${start + 1}-${start + slice.length} of ${total}`);
        for (const handle of slice) {
          try {
            await appendLog(userId, requestId, "info", `fetch product handle=${handle}`);
            const product = await fetchProductByHandle(shopifyBaseUrl, handle);
            if (!product) {
              await updateJob(userId, requestId, { processed: 1 });
              await appendLog(userId, requestId, "error", `not found handle=${handle}`);
              continue;
            }
            const payload = buildWooProductPayload(product);
            payload.categories = catTerms;
            payload.tags = tagTerms;
            const existing = await findProductBySkuOrSlug(dstCfg, undefined, product.handle);
            let saved: { id?: number; name?: string } = {};
            if (existing) saved = await (await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload)).json();
            else saved = await (await wooPost(dstCfg, "wp-json/wc/v3/products", { ...payload, slug: product.handle })).json();
            if (Array.isArray(product.variants) && product.variants.length > 1) {
              for (const v of product.variants) {
                const varPayload = buildVariationFromShopifyVariant(v);
                await wooPost(dstCfg, `wp-json/wc/v3/products/${saved.id}/variations`, varPayload).then((r) => r.json());
              }
            }
            await updateJob(userId, requestId, { processed: 1, success: 1 });
            await recordResult(userId, "shopify", requestId, String(product.handle||""), String(saved?.name || ""), (typeof saved?.id === 'number' ? saved?.id : undefined), "success");
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
            await appendLog(userId, requestId, "error", `job error ${errorMessage}`);
            await updateJob(userId, requestId, { processed: 1 });
          }
        }
      }

      if (source === "wordpress") {
        const links: string[] = params.links || [];

        const start = processed;
        const slice = links.slice(start, start + batchSize);
        await appendLog(userId, requestId, "info", `start batch ${start + 1}-${start + slice.length} of ${total}`);
        for (const link of slice) {
          try {
            const meta = await fetchHtmlMeta(link);
            
            // 检测并记录网址不匹配
            if (meta.urlMismatch && meta.finalUrl !== link) {
              await appendLog(userId, requestId, "info", `网址重定向检测: 原始URL=${link} 最终URL=${meta.finalUrl}`);
            }
            
            await appendLog(userId, requestId, "info", `fetch ${link} status=${meta.status} type=${meta.contentType}`);
            const html = meta.html;
            const ld = extractJsonLdProduct(html);
            let vars = extractProductVariations(html);
            if (!vars.length) {
              const attrs = extractFormAttributes(html);
              const price = extractProductPrice(html);
              vars = buildVariationsFromForm(attrs, price);
            }
            const breadcrumbCats = extractBreadcrumbCategories(html);
            const postedCats = extractPostedInCategories(html);
            const cat = ld?.category;
            const fromLd = Array.isArray(cat) ? cat : cat ? [cat] : [];
            const allCats = Array.from(new Set([...(breadcrumbCats || []), ...(postedCats || []), ...fromLd].map((x) => String(x).trim()).filter(Boolean)));
            const tags = extractTags(html);
            const slug = normalizeWpSlugOrLink(link);
            const sku = extractSku(html) || ld?.sku || slug;
            let images = extractGalleryImages(html);
            if (!images.length) {
              const ogs = extractOgImages(html);
              const contents = extractContentImages(html);
              images = Array.from(new Set([...(ogs || []), ...(contents || [])]));
            }
            const descHtml = extractDescriptionHtml(html) || ld?.description;
            const payload: WordPressProductPayload = {
              name: ld?.name || slug,
              slug,
              sku,
              description: descHtml || "",
              short_description: descHtml || "",
              images: [],
            };
            const catTerms = await ensureTerms(dstCfg, "category", allCats);
            const tagTerms = await ensureTerms(dstCfg, "tag", tags);
            payload.categories = catTerms;
            payload.tags = tagTerms;
            const existing = await findProductBySkuOrSlug(dstCfg, sku, slug);
            let resp: Response;
            if (existing) resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
            else resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug });
            const ct = resp.headers.get("content-type") || "";
            if (!resp.ok || !ct.includes("application/json")) {
              await updateJob(userId, requestId, { processed: 1 });
              continue;
            }
            const savedProd = await resp.json().catch(() => ({})) as WooProduct;
            try {
              const remotes = images.map((u) => new URL(u, meta.finalUrl || link).toString());
              const maxImages = parseInt(process.env.RUNNER_MAX_IMAGES_PER_PRODUCT || "10", 10) || 10;
              const toUpload = remotes.slice(0, maxImages);
              let base: Array<{ id?: number }> = [];
              if (typeof savedProd?.id === "number") {
                const cur = await (await wooGet(dstCfg, `wp-json/wc/v3/products/${savedProd.id}`)).json().catch(()=>({}));
                base = Array.isArray(cur?.images) ? cur.images.map((ii: { id?: number }) => ({ id: ii?.id })) : [];
                const maxRetryImg = parseInt(process.env.IMAGE_UPLOAD_RETRY || "2", 10) || 2;
                const backoffImg = parseInt(process.env.IMAGE_RETRY_BACKOFF || "2000", 10) || 2000;
                for (const src of toUpload) {

                  for (let ai = 0; ai <= maxRetryImg; ai++) {
                    await new Promise((r)=>setTimeout(r, backoffImg * (ai + 1)));
                    const up = await wooPut(dstCfg, `wp-json/wc/v3/products/${savedProd.id}`, { images: [...base, { src }] });
                    const ct2 = up.headers.get("content-type") || "";
                    if (up.ok && ct2.includes("application/json")) {
                      const j = await up.json().catch(()=>({}));
                      base = Array.isArray(j?.images) ? j.images.map((ii: { id?: number }) => ({ id: ii?.id })) : base;

                      break;
                    } else {
                      const txt = await up.text().catch(()=>"");
                      try { await appendLog(userId, requestId, "error", `image upload failed product=${savedProd.id} status=${up.status} body=${txt.slice(0,300)}`); } catch {}
                    }
                  }
                }
              }
            } catch {}
            await updateJob(userId, requestId, { processed: 1, success: 1 });
            await recordResult(userId, "wordpress", requestId, slug, (savedProd?.name || payload?.name), (typeof savedProd?.id === 'number' ? savedProd?.id : existing?.id), "success");
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
            await appendLog(userId, requestId, "error", `job error ${errorMessage}`);
            await updateJob(userId, requestId, { processed: 1 });
          }
        }
      }

      if (source === "wix") {
        const links: string[] = params.links || [];
        const start = processed;
        const slice = links.slice(start, start + batchSize);
        await appendLog(userId, requestId, "info", `start batch ${start + 1}-${start + slice.length} of ${total}`);
        for (const link of slice) {
          try {
            const meta = await fetchHtmlMeta(link);
            const html = meta.html;
            
            // 检测并记录网址不匹配
            if (meta.urlMismatch && meta.finalUrl !== link) {
              await appendLog(userId, requestId, "info", `网址重定向检测: 原始URL=${link} 最终URL=${meta.finalUrl}`);
            }
            
            const ld = extractJsonLdProduct(html);
            const slug = normalizeWpSlugOrLink(link);
            const descHtml = extractDescriptionHtml(html) || ld?.description || "";
            let images = extractGalleryImages(html);
            if (!images.length) {
              const ogs = extractOgImages(html);
              const contents = extractContentImages(html);
              images = Array.from(new Set([...(ogs || []), ...(contents || [])]));
            }
            const payload: WordPressProductPayload = { name: ld?.name || slug, slug, description: descHtml, short_description: descHtml, images: [] };
            const existing = await findProductBySkuOrSlug(dstCfg, undefined, slug);
            let resp: Response;
            if (existing) resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
            else resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug });
            const ct = resp.headers.get("content-type") || "";
            if (!resp.ok || !ct.includes("application/json")) {
              await updateJob(userId, requestId, { processed: 1 });
              continue;
            }
            const saved = await resp.json().catch(() => ({})) as WooProduct;
            try {
              const remotes = images.map((u) => new URL(u, meta.finalUrl || link).toString());
              const maxImages = parseInt(process.env.RUNNER_MAX_IMAGES_PER_PRODUCT || "10", 10) || 10;
              const toUpload = remotes.slice(0, maxImages);
              let base: Array<{ id?: number }> = [];
              if (typeof saved?.id === "number") {
                const cur = await (await wooGet(dstCfg, `wp-json/wc/v3/products/${saved.id}`)).json().catch(()=>({}));
                base = Array.isArray(cur?.images) ? cur.images.map((ii: { id?: number }) => ({ id: ii?.id })) : [];
                const maxRetryImg2 = parseInt(process.env.IMAGE_UPLOAD_RETRY || "2", 10) || 2;
                const backoffImg2 = parseInt(process.env.IMAGE_RETRY_BACKOFF || "2000", 10) || 2000;
                for (const src of toUpload) {

                  for (let ai = 0; ai <= maxRetryImg2; ai++) {
                    await new Promise((r)=>setTimeout(r, backoffImg2 * (ai + 1)));
                    const up = await wooPut(dstCfg, `wp-json/wc/v3/products/${saved.id}`, { images: [...base, { src }] });
                    const ct2 = up.headers.get("content-type") || "";
                    if (up.ok && ct2.includes("application/json")) {
                      const j = await up.json().catch(()=>({}));
                      base = Array.isArray(j?.images) ? j.images.map((ii: { id?: number }) => ({ id: ii?.id })) : base;

                      break;
                    } else {
                      const txt = await up.text().catch(()=>"");
                      try { await appendLog(userId, requestId, "error", `image upload failed product=${saved.id} status=${up.status} body=${txt.slice(0,300)}`); } catch {}
                    }
                  }
                }
              }
            } catch {}
            await updateJob(userId, requestId, { processed: 1, success: 1 });
            await recordResult(userId, "wix", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "success");
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
            await appendLog(userId, requestId, "error", `job error ${errorMessage}`);
            await updateJob(userId, requestId, { processed: 1 });
          }
        }
      }

      const { data: j2 } = await supabase
        .from("import_jobs")
        .select("total,processed")
        .eq("request_id", requestId)
        .limit(1)
        .maybeSingle();
      const done = (j2?.processed || 0) >= (j2?.total || 0);
      if (done) await finishJob(userId, requestId, "done");
      else await supabase.from("import_jobs").update({ status: "queued", updated_at: new Date().toISOString() }).eq("request_id", requestId);
    }

    return NextResponse.json({ ok: true, picked: handled });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
