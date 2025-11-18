import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken } from "@/lib/supabaseServer";
import { appendLog } from "@/lib/logs";
// import-jobs 相关逻辑已移除
import { recordResult } from "@/lib/history";
import { ensureTerms, findProductBySkuOrSlug, wooPost, wooPut, wooGet } from "@/lib/woo";
import { fetchProductByHandle } from "@/lib/shopify";
import { buildWooProductPayload, buildVariationFromShopifyVariant, type WooProductPayload } from "@/lib/importMap";
import { fetchHtmlMeta, extractJsonLdProduct, extractProductVariations, extractFormAttributes, extractProductPrice, buildVariationsFromForm, extractBreadcrumbCategories, extractPostedInCategories, extractTags, extractDescriptionHtml, extractGalleryImages, extractOgImages, extractContentImages, extractSku } from "@/lib/wordpressScrape";
import { normalizeWpSlugOrLink, WooProduct } from "@/lib/wordpress";
import { pgmqQueueName, pgmqRead, pgmqDelete, pgmqArchive, pgmqSetVt } from "@/lib/pgmq";
const lastRunBySource = new Map<string, number>();
const inFlightSources = new Set<string>();

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

export const runtime = "nodejs";

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

async function updateJob(userId: string, requestId: string, data: { processed?: number; success?: number; error?: number }) { void userId; void requestId; void data; }

async function runForSource(source: string) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "服务未配置" }, { status: 500 });
  const now = Date.now();
  const minInterval = parseInt(process.env.RUNNER_MIN_INTERVAL_MS || "5000", 10) || 5000;
  const last = lastRunBySource.get(source) || 0;
  if (now - last < minInterval) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (inFlightSources.has(source)) {
    return NextResponse.json({ ok: true, busy: true });
  }
  inFlightSources.add(source);
  lastRunBySource.set(source, now);
  const U = (s: string) => s.toUpperCase();
  const batchSize = parseInt(process.env[`RUNNER_${U(source)}_BATCH_SIZE`] || process.env.RUNNER_MAX_ITEMS_PER_JOB_TICK || "25", 10) || 25;
  const maxMessages = parseInt(process.env.RUNNER_MAX_MESSAGES_PER_INVOCATION || "100", 10) || 100;
  const maxErrors = parseInt(process.env.RUNNER_HARD_STOP_MAX_ERRORS_PER_INVOCATION || "50", 10) || 50;
  const maxWallTimeMs = parseInt(process.env.RUNNER_MAX_WALLTIME_MS || "60000", 10) || 60000;

  if (true) {
    const q = pgmqQueueName(source);
    const vt = parseInt(process.env.RUNNER_VT_SECONDS || "60", 10) || 60;
    const msgs = await pgmqRead(q, vt, batchSize);
    if (!msgs.length) { inFlightSources.delete(source); return NextResponse.json({ ok: true, picked: 0 }); }
    let processedCount = 0;
    let errorCount = 0;
    const started = Date.now();
    for (const row of msgs) {
      const msg = (row.message || {}) as PgmqMessage;
      const userId = String(msg.userId || "");
      const requestId = String(msg.requestId || "");
      if (!userId || !requestId) { await pgmqArchive(q, row.msg_id).catch(()=>{}); continue; }
      try { await appendLog(userId, requestId, "info", `cfg source=${source} batchSize=${batchSize}`); } catch {}
      try { await appendLog(userId, requestId, "info", `begin source=${source} mid=${row.msg_id}`); } catch {}
      const { data: cfg } = await supabase
        .from("user_configs")
        .select("wordpress_url, consumer_key, consumer_secret")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      try { await appendLog(userId, requestId, "info", `queue=${q} vt=${vt} msg_id=${row.msg_id} read_ct=${row.read_ct||0} wpUrl=${(cfg?.wordpress_url)?"set":"empty"} key=${(cfg?.consumer_key)?"set":"empty"} secret=${(cfg?.consumer_secret)?"set":"empty"}`); } catch {}
      const wordpressUrl = cfg?.wordpress_url || "";
      const consumerKey = cfg?.consumer_key || "";
      const consumerSecret = cfg?.consumer_secret || "";
      if (!wordpressUrl || !consumerKey || !consumerSecret) {
        await appendLog(userId, requestId, "error", "目标站 Woo 配置未设置");
        await pgmqArchive(q, row.msg_id).catch(()=>{});
        continue;
      }
      const dstCfg = { url: wordpressUrl, consumerKey, consumerSecret };
      try {
        if (source === "shopify") {
          const categories: string[] = Array.isArray(msg.categories) ? msg.categories : [];
          const tags: string[] = Array.isArray(msg.tags) ? msg.tags : [];
          const catTerms = await ensureTerms(dstCfg, "category", categories);
          const tagTerms = await ensureTerms(dstCfg, "tag", tags);
          const product = await fetchProductByHandle(String(msg.shopifyBaseUrl || ""), String(msg.handle || ""));
          if (!product) {
            await appendLog(userId, requestId, "error", `not found handle=${String(msg.handle||"")}`);
            await recordResult(userId, "shopify", requestId, String(msg.handle||""), String(msg.handle||""), undefined, "error");
          } else {
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
            await recordResult(userId, "shopify", requestId, product.handle, saved?.name, saved?.id, "success");
          }
        } else if (source === "wordpress") {
          const link = String(msg.link || "");
          const meta = await fetchHtmlMeta(link);
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
          const payload: WooProductPayload = { name: ld?.name || slug, slug, sku, description: descHtml || "", short_description: descHtml || "", images: [] };
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
            await recordResult(userId, "wordpress", requestId, slug, payload?.name, existing?.id, "error");
          } else {
            const saved = await resp.json().catch(()=>({})) as WooProduct;
            let imagesOk = true;
            try {
              const remotes = images.map((u) => new URL(u, meta.finalUrl || link).toString());
              const maxImages = parseInt(process.env.RUNNER_MAX_IMAGES_PER_PRODUCT || "10", 10) || 10;
              const toUpload = remotes.slice(0, maxImages);
              let base: Array<{ id?: number }> = [];
              if (typeof saved?.id === "number") {
                const cur = await (await wooGet(dstCfg, `wp-json/wc/v3/products/${saved.id}`)).json().catch(()=>({}));
                base = Array.isArray(cur?.images) ? cur.images.map((ii: { id?: number }) => ({ id: ii?.id })) : [];
                const maxRetryImg = parseInt(process.env.IMAGE_UPLOAD_RETRY || "2", 10) || 2;
                const backoffImg = parseInt(process.env.IMAGE_RETRY_BACKOFF || "2000", 10) || 2000;
                for (const src of toUpload) {
                  let ok = false;
                  for (let ai = 0; ai <= maxRetryImg; ai++) {
                    await new Promise((r)=>setTimeout(r, backoffImg * (ai + 1)));
                    const up = await wooPut(dstCfg, `wp-json/wc/v3/products/${saved.id}`, { images: [...base, { src }] });
                    const ct2 = up.headers.get("content-type") || "";
                    if (up.ok && ct2.includes("application/json")) {
                      const j = await up.json().catch(()=>({}));
                      base = Array.isArray(j?.images) ? j.images.map((ii: { id?: number }) => ({ id: ii?.id })) : base;
                      ok = true;
                      break;
                    }
                  }
                  if (!ok) imagesOk = false;
                }
              }
            } catch { imagesOk = false; }
            if (imagesOk) {
              await updateJob(userId, requestId, { processed: 1, success: 1 });
              await recordResult(userId, "wordpress", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "success");
            } else {
              await updateJob(userId, requestId, { processed: 1, error: 1 });
              await recordResult(userId, "wordpress", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "error");
            }
          }
        } else if (source === "wix") {
          const link = String(msg.link || "");
          const meta = await fetchHtmlMeta(link);
          const html = meta.html;
          const ld = extractJsonLdProduct(html);
          const slug = normalizeWpSlugOrLink(link);
          const descHtml = extractDescriptionHtml(html) || ld?.description || "";
          let images = extractGalleryImages(html);
          if (!images.length) {
            const ogs = extractOgImages(html);
            const contents = extractContentImages(html);
            images = Array.from(new Set([...(ogs || []), ...(contents || [])]));
          }
          const payload: WooProductPayload = { name: ld?.name || slug, slug, description: descHtml, short_description: descHtml, images: [] };
          const existing = await findProductBySkuOrSlug(dstCfg, undefined, slug);
          let resp: Response;
          if (existing) resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
          else resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug });
          const ct = resp.headers.get("content-type") || "";
          if (!resp.ok || !ct.includes("application/json")) {
            await recordResult(userId, "wix", requestId, slug, payload?.name, existing?.id, "error");
          } else {
            const saved = await resp.json().catch(()=>({}));
            await updateJob(userId, requestId, { processed: 1, success: 1 });
            await recordResult(userId, "wix", requestId, slug, (saved?.name || payload?.name), (typeof saved?.id === 'number' ? saved?.id : existing?.id), "success");
          }
        }
      try {
        await pgmqDelete(q, row.msg_id);
        try { await appendLog(userId, requestId, "info", `pgmq delete mid=${row.msg_id}`); } catch {}
      } catch (delErr) {
        try { await appendLog(userId, requestId, "error", `pgmqDelete failed mid=${row.msg_id} err=${(delErr as Error)?.message || delErr}`); } catch {}
        try { await pgmqArchive(q, row.msg_id); } catch {}
      }
      processedCount++;
      if (processedCount >= maxMessages) break;
      if (Date.now() - started > maxWallTimeMs) break;
      } catch {
        const maxRetry = parseInt(process.env.RUNNER_MAX_READ_RETRIES || "5", 10) || 5;
        if ((row.read_ct || 0) + 1 >= maxRetry) await pgmqArchive(q, row.msg_id).catch(()=>{});
        else await pgmqSetVt(q, row.msg_id, vt * Math.min(10, (row.read_ct || 0) + 1)).catch(()=>{});
        errorCount++;
        if (errorCount >= maxErrors) break;
        if (Date.now() - started > maxWallTimeMs) break;
      }
    }
    inFlightSources.delete(source);
    return NextResponse.json({ ok: true, picked: msgs.length });
  }

}

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const parts = u.pathname.split("/").filter(Boolean);
  const source = parts[parts.length - 1] || "";
  return runForSource(source.toLowerCase());
}

export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const parts = u.pathname.split("/").filter(Boolean);
  const source = parts[parts.length - 1] || "";
  return runForSource(source.toLowerCase());
}
