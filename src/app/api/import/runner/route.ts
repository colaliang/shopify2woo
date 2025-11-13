import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { appendLog } from "@/lib/logs";
import { pgmqQueueName, pgmqRead, pgmqDelete, pgmqArchive, pgmqSetVt } from "@/lib/pgmq";
import { finishJob, updateJob } from "@/lib/progress";
import { recordResult } from "@/lib/history";
import { ensureTerms, findProductBySkuOrSlug, wooPost, wooPut } from "@/lib/woo";
import { fetchProductByHandle } from "@/lib/shopify";
import { buildWooProductPayload, buildVariationFromShopifyVariant } from "@/lib/importMap";
import { fetchHtmlMeta, extractJsonLdProduct, extractProductVariations, extractFormAttributes, extractProductPrice, buildVariationsFromForm, extractBreadcrumbCategories, extractPostedInCategories, extractTags, extractDescriptionHtml, extractGalleryImages, extractOgImages, extractContentImages, extractSku } from "@/lib/wordpressScrape";
import { normalizeWpSlugOrLink } from "@/lib/wordpress";

export const runtime = "nodejs";

function authorize(req: Request) {
  const token = process.env.RUNNER_TOKEN || "";
  if (!token) return true;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (bearer && bearer === token) return true;
  const url = new URL(req.url);
  const qp = url.searchParams.get("token") || "";
  return qp && qp === token;
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
          const msg = row.message || {};
          const userId = String(msg.userId || "");
          const requestId = String(msg.requestId || "");
          if (!userId || !requestId) { await pgmqArchive(q, row.msg_id).catch(()=>{}); continue; }
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
            await pgmqArchive(q, row.msg_id).catch(()=>{});
            await finishJob(userId, requestId, "error").catch(()=>{});
            continue;
          }
          const dstCfg = { url: wordpressUrl, consumerKey, consumerSecret };
          try {
            if (s === "shopify") {
              const categories: string[] = Array.isArray(msg.categories) ? msg.categories : [];
              const tags: string[] = Array.isArray(msg.tags) ? msg.tags : [];
              const catTerms = await ensureTerms(dstCfg, "category", categories);
              const tagTerms = await ensureTerms(dstCfg, "tag", tags);
              const product = await fetchProductByHandle(String(msg.shopifyBaseUrl || ""), String(msg.handle || ""));
              if (!product) {
                await updateJob(userId, requestId, { processed: 1, error: 1 });
                await appendLog(userId, requestId, "error", `not found handle=${String(msg.handle||"")}`);
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
            } else if (s === "wordpress") {
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
              const payload: any = { name: ld?.name || slug, slug, sku, description: descHtml || "", short_description: descHtml || "", images: images.map((u) => ({ src: new URL(u, meta.finalUrl || link).toString() })) };
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
                await updateJob(userId, requestId, { processed: 1, error: 1 });
              } else {
                await resp.json().catch(()=>({}));
                await updateJob(userId, requestId, { processed: 1, success: 1 });
                await recordResult(userId, "wordpress", requestId, slug, payload?.name, (payload as any)?.id, "success");
              }
            } else if (s === "wix") {
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
              const payload: any = { name: ld?.name || slug, slug, description: descHtml, short_description: descHtml, images: images.map((u) => ({ src: new URL(u, meta.finalUrl || link).toString() })) };
              const existing = await findProductBySkuOrSlug(dstCfg, undefined, slug);
              let resp: Response;
              if (existing) resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
              else resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug });
              const ct = resp.headers.get("content-type") || "";
              if (!resp.ok || !ct.includes("application/json")) {
                await updateJob(userId, requestId, { processed: 1, error: 1 });
              } else {
                await resp.json().catch(()=>({}));
                await updateJob(userId, requestId, { processed: 1, success: 1 });
                await recordResult(userId, "wix", requestId, slug, payload?.name, (payload as any)?.id, "success");
              }
            }
            await pgmqDelete(q, row.msg_id);
          } catch (e: any) {
            const maxRetry = parseInt(process.env.RUNNER_MAX_READ_RETRIES || "5", 10) || 5;
            if ((row.read_ct || 0) + 1 >= maxRetry) await pgmqArchive(q, row.msg_id).catch(()=>{});
            else await pgmqSetVt(q, row.msg_id, vt * Math.min(10, (row.read_ct || 0) + 1)).catch(()=>{});
            await updateJob(userId, requestId, { processed: 1, error: 1 }).catch(()=>{});
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
      return NextResponse.json({ ok: true, picked });
    }
    const q = supabase
      .from("import_jobs")
      .select("request_id,user_id,source,total,processed,status,params,created_at")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(maxJobs);
    if (src) (q as any).eq("source", src);
    const { data: jobs } = await q as any;
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
              await updateJob(userId, requestId, { processed: 1, error: 1 });
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
            await recordResult(userId, "shopify", requestId, product.handle, saved?.name, saved?.id, "success");
          } catch (e: any) {
            await appendLog(userId, requestId, "error", `job error ${e?.message || e}`);
            await updateJob(userId, requestId, { processed: 1, error: 1 });
          }
        }
      }

      if (source === "wordpress") {
        const links: string[] = params.links || [];
        const base: string = params.sourceUrl || "";
        const start = processed;
        const slice = links.slice(start, start + batchSize);
        await appendLog(userId, requestId, "info", `start batch ${start + 1}-${start + slice.length} of ${total}`);
        for (const link of slice) {
          try {
            const meta = await fetchHtmlMeta(link);
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
            const payload: any = {
              name: ld?.name || slug,
              slug,
              sku,
              description: descHtml || "",
              short_description: descHtml || "",
              images: images.map((u) => ({ src: new URL(u, meta.finalUrl || link).toString() })),
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
              await updateJob(userId, requestId, { processed: 1, error: 1 });
              continue;
            }
            await resp.json().catch(() => ({}));
            await updateJob(userId, requestId, { processed: 1, success: 1 });
            await recordResult(userId, "wordpress", requestId, slug, payload?.name, (payload as any)?.id, "success");
          } catch (e: any) {
            await appendLog(userId, requestId, "error", `job error ${e?.message || e}`);
            await updateJob(userId, requestId, { processed: 1, error: 1 });
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
            const ld = extractJsonLdProduct(html);
            const slug = normalizeWpSlugOrLink(link);
            const descHtml = extractDescriptionHtml(html) || ld?.description || "";
            let images = extractGalleryImages(html);
            if (!images.length) {
              const ogs = extractOgImages(html);
              const contents = extractContentImages(html);
              images = Array.from(new Set([...(ogs || []), ...(contents || [])]));
            }
            const payload: any = { name: ld?.name || slug, slug, description: descHtml, short_description: descHtml, images: images.map((u) => ({ src: new URL(u, meta.finalUrl || link).toString() })) };
            const existing = await findProductBySkuOrSlug(dstCfg, undefined, slug);
            let resp: Response;
            if (existing) resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
            else resp = await wooPost(dstCfg, `wp-json/wc/v3/products`, { ...payload, slug });
            const ct = resp.headers.get("content-type") || "";
            if (!resp.ok || !ct.includes("application/json")) {
              await updateJob(userId, requestId, { processed: 1, error: 1 });
              continue;
            }
            await resp.json().catch(() => ({}));
            await updateJob(userId, requestId, { processed: 1, success: 1 });
            await recordResult(userId, "wix", requestId, slug, payload?.name, (payload as any)?.id, "success");
          } catch (e: any) {
            await appendLog(userId, requestId, "error", `job error ${e?.message || e}`);
            await updateJob(userId, requestId, { processed: 1, error: 1 });
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
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}