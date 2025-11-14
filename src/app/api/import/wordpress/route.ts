import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken, readLocalConfig } from "@/lib/supabaseServer";
import { ensureTerms, findProductBySkuOrSlug, wooPost, wooPut } from "@/lib/woo";
import {
  WooConfig as SourceCfg,
  fetchSourceProductsAll,
  fetchSourceProductBySlug,
  fetchSourceVariations,
  buildWooPayloadFromWooProduct,
  getTermNames,
  normalizeWpSlugOrLink,
} from "@/lib/wordpress";
import {
  fetchHtmlMeta,
  extractJsonLdProduct,
  extractProductVariations,
  buildPayloadFromScraped,
  extractBreadcrumbCategories,
  extractTags,
  extractProductPrice,
  extractFormAttributes,
  buildVariationsFromForm,
  discoverAllProductLinks,
  extractDescriptionHtml,
  extractGalleryImages,
  extractPostedInCategories,
  extractSku,
  extractOgImages,
  extractContentImages,
} from "@/lib/wordpressScrape";
// import-jobs 相关逻辑已移除
import { recordResult } from "@/lib/history";
import { appendLog } from "@/lib/logs";
import { logInfo, logError } from "@/lib/terminal";
import { pgmqQueueName, pgmqSendBatch } from "@/lib/pgmq";

interface WordPressImportParams {
  sourceUrl: string;
  links: string[];
}

type VariationPost = {
  sku?: string;
  regular_price?: string;
  sale_price?: string;
  image?: { src?: string } | null;
  attributes?: Array<{ name?: string; option?: string }>;
};

interface WordPressProductPayload {
  id?: number;
  name?: string;
  slug?: string;
  sku?: string;
  type?: string;
  description?: string;
  short_description?: string;
  regular_price?: string;
  images?: Array<{ src: string }>;
  attributes?: Array<{ name: string; visible: boolean; variation: boolean; options: string[] }>;
  default_attributes?: Array<{ name: string; option: string }>;
  categories?: Array<{ name: string }>;
  tags?: Array<{ name: string }>;
  _scraped?: { variations?: VariationPost[] };
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sourceUrl, sourceKey, sourceSecret, mode, productLinks = [], cap } = body || {};
    if (mode !== "all" && mode !== "links") return NextResponse.json({ error: "缺少或非法导入模式" }, { status: 400 });
    if (mode === "all" && !sourceUrl) return NextResponse.json({ error: "全站模式需提供源站 URL" }, { status: 400 });

    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = await getUserIdFromToken(token);
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    let wordpressUrl = "";
    let consumerKey = "";
    let consumerSecret = "";
    {
      const supabase = getSupabaseServer();
      if (!supabase) return NextResponse.json({ error: "服务未配置" }, { status: 500 });
      const { data } = await supabase
        .from("user_configs")
        .select("wordpress_url, consumer_key, consumer_secret")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      wordpressUrl = data?.wordpress_url || "";
      consumerKey = data?.consumer_key || "";
      consumerSecret = data?.consumer_secret || "";
      if (!wordpressUrl && !consumerKey && !consumerSecret) {
        const local = readLocalConfig(userId);
        wordpressUrl = local?.wordpressUrl || "";
        consumerKey = local?.consumerKey || "";
        consumerSecret = local?.consumerSecret || "";
      }
    }
    if (!wordpressUrl || !consumerKey || !consumerSecret) return NextResponse.json({ error: "目标站 Woo 配置未设置" }, { status: 400 });

    const srcCfg: SourceCfg = { url: sourceUrl || "", consumerKey: sourceKey || "", consumerSecret: sourceSecret || "" };
    const dstCfg = { url: wordpressUrl, consumerKey, consumerSecret };

    const maxCap = typeof cap === "number" && cap > 0 ? Math.min(cap, 5000) : 1000;
    const requestId = Math.random().toString(36).slice(2, 10);

    let jobTotal = 0;
    let discovered: string[] = [];
    let links: string[] = [];
    if (mode === "all") {
      discovered = await discoverAllProductLinks(sourceUrl, maxCap);
      jobTotal = discovered.length;
    } else {
      links = (Array.isArray(productLinks) ? productLinks : [])
        .map((s: string) => normalizeWpSlugOrLink(String(s || "")))
        .filter(Boolean);
      jobTotal = links.length;
    }

    const supabase = getSupabaseServer();
    if (supabase) {
      if (process.env.USE_PGMQ === "1") {
        await supabase.from("import_jobs").upsert({ request_id: requestId, user_id: userId, source: "wordpress", total: jobTotal, processed: 0, success_count: 0, error_count: 0, status: "queued" }, { onConflict: "request_id" });
        const q = pgmqQueueName("wordpress");
        const items = (mode === "all" ? discovered : links).map((l) => ({ userId, requestId, source: "wordpress", link: /^https?:\/\//.test(l) ? l : new URL(l, sourceUrl).toString(), sourceUrl }));
        const chunk = 300;
        for (let i = 0; i < items.length; i += chunk) {
          await pgmqSendBatch(q, items.slice(i, i + chunk));
        }
        await appendLog(userId, requestId, "info", `pgmq queued ${jobTotal} links from ${sourceUrl}`);
        return NextResponse.json({ success: true, requestId, count: jobTotal }, { status: 202 });
      } else {
        const params: WordPressImportParams = { sourceUrl, links };
        await supabase.from("import_jobs").upsert({ request_id: requestId, user_id: userId, source: "wordpress", total: jobTotal, processed: 0, success_count: 0, error_count: 0, status: "queued", params }, { onConflict: "request_id" });
        await appendLog(userId, requestId, "info", mode === "all" ? `queued ${jobTotal} links from ${sourceUrl}` : `queued ${jobTotal} links by request`);
        return NextResponse.json({ success: true, requestId, count: jobTotal }, { status: 202 });
      }
    }

    await createJob(userId, "wordpress", requestId, jobTotal);
    await appendLog(userId, requestId, "info", mode === "all" ? `discover ${jobTotal} links from ${sourceUrl}` : `start import ${jobTotal} links by request`);

    setTimeout(async () => {
      try {
        const results: Array<{ slug?: string; id?: number; name?: string; error?: string }> = [];
        const sourceProducts = [] as (Awaited<ReturnType<typeof fetchSourceProductsAll>>[number] & { _scraped?: { variations?: VariationPost[] } })[];

        if (mode === "all") {
          for (const link of discovered) {
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
              const mapped = buildPayloadFromScraped(link, ld, vars);
              const cats = (() => {
                const arr = extractBreadcrumbCategories(html);
                const cat = ld?.category;
                const fromLd = Array.isArray(cat) ? cat : cat ? [cat] : [];
                const postedIn = extractPostedInCategories(html);
                return Array.from(new Set([...arr, ...fromLd, ...postedIn].map((x) => String(x).trim()).filter(Boolean)));
              })();
              const tags = extractTags(html);
              const slug = normalizeWpSlugOrLink(link);
              const payloadImages = (mapped.payload?.images || []) as Array<{ src: string }>;
              let absImages = payloadImages.map((i) => ({ src: new URL(i.src, link).toString() }));
              if (!absImages.length) {
                const ogs = extractOgImages(html);
                const contents = extractContentImages(html);
                const merged = Array.from(new Set([...ogs, ...contents])).map((u) => ({ src: new URL(u, link).toString() }));
                absImages = merged;
              }
              const payloadAttributes = (mapped.payload?.attributes || []) as Array<{ name: string; visible: boolean; variation: boolean; options: string[] }>;
              await appendLog(userId, requestId, "info", `parsed ${link} imgs=${absImages.length} attrs=${payloadAttributes.length} desc=${(ld?.description || extractDescriptionHtml(html) || "").length} sku=${ld?.sku || extractSku(html) || ""}`);
              sourceProducts.push({
                id: undefined,
                name: String(ld?.name || slug),
                slug,
                type: vars.length > 1 ? "variable" : "simple",
                sku: ld?.sku || extractSku(html),
                description: ld?.description || extractDescriptionHtml(html) || "",
                short_description: extractDescriptionHtml(html) || undefined,
                images: absImages.length ? absImages : extractGalleryImages(html).map((src) => ({ src: new URL(src, link).toString() })),
                attributes: payloadAttributes,
                default_attributes: (mapped.payload?.default_attributes || []) as Array<{ name: string; option: string }>,
                categories: cats.map((n) => ({ name: n })),
                tags: tags.map((n) => ({ name: n })),
              } as WordPressProductPayload);
              sourceProducts[sourceProducts.length - 1]._scraped = mapped;
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              results.push({ slug: normalizeWpSlugOrLink(link), error: msg });
              await appendLog(userId, requestId, "error", `parse failed ${link}: ${msg}`);
              await updateJob(userId, requestId, { processed: 1, error: 1 });
            }
          }
        } else {
          for (const slug of links) {
            let p = null;
            if (sourceUrl && sourceKey && sourceSecret) {
              p = await fetchSourceProductBySlug(srcCfg, slug);
            }
            if (!p) {
              try {
                const linkUrl = /^https?:\/\//.test(slug) ? slug : `${sourceUrl?.replace(/\/$/, "")}/${slug}`;
                const meta = await fetchHtmlMeta(linkUrl);
                await appendLog(userId, requestId, "info", `fetch ${linkUrl} status=${meta.status} type=${meta.contentType}`);
                const html = meta.html;
                const ld = extractJsonLdProduct(html);
                let vars = extractProductVariations(html);
                if (!vars.length) {
                  const attrs = extractFormAttributes(html);
                  const price = extractProductPrice(html);
                  vars = buildVariationsFromForm(attrs, price);
                }
                const mapped = buildPayloadFromScraped(linkUrl, ld, vars);
                const cats = (() => {
                  const arr = extractBreadcrumbCategories(html);
                  const cat = ld?.category;
                  const fromLd = Array.isArray(cat) ? cat : cat ? [cat] : [];
                  const postedIn = extractPostedInCategories(html);
                  return Array.from(new Set([...arr, ...fromLd, ...postedIn].map((x) => String(x).trim()).filter(Boolean)));
                })();
                const tags = extractTags(html);
                let absImages2 = ((mapped.payload?.images || []) as Array<{ src: string }>).map((i) => ({ src: new URL(i.src, linkUrl).toString() }));
                if (!absImages2.length) {
                  const ogs = extractOgImages(html);
                  const contents = extractContentImages(html);
                  const merged = Array.from(new Set([...ogs, ...contents])).map((u) => ({ src: new URL(u, linkUrl).toString() }));
                  absImages2 = merged;
                }
                await appendLog(userId, requestId, "info", `parsed ${linkUrl} imgs=${absImages2.length} attrs=${((mapped.payload?.attributes || []) as Array<{ name: string; visible: boolean; variation: boolean; options: string[] }>).length} desc=${(ld?.description || extractDescriptionHtml(html) || "").length} sku=${ld?.sku || extractSku(html) || ""}`);
                sourceProducts.push({
                  id: undefined,
                  name: String(ld?.name || slug),
                  slug,
                  type: vars.length > 1 ? "variable" : "simple",
                  sku: ld?.sku || extractSku(html),
                  description: ld?.description || extractDescriptionHtml(html) || "",
                  short_description: extractDescriptionHtml(html) || undefined,
                  images: absImages2.length ? absImages2 : extractGalleryImages(html).map((src) => ({ src: new URL(src, linkUrl).toString() })),
                  attributes: (mapped.payload?.attributes || []) as Array<{ name: string; visible: boolean; variation: boolean; options: string[] }>,
                  default_attributes: (mapped.payload?.default_attributes || []) as Array<{ name: string; option: string }>,
                  categories: cats.map((n) => ({ name: n })),
                  tags: tags.map((n) => ({ name: n })),
                } as WordPressProductPayload);
                sourceProducts[sourceProducts.length - 1]._scraped = mapped;
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                results.push({ slug, error: msg });
                await appendLog(userId, requestId, "error", `parse failed ${slug}: ${msg}`);
                await updateJob(userId, requestId, { processed: 1, error: 1 });
              }
            } else {
              sourceProducts.push(p);
              await appendLog(userId, requestId, "info", `found by REST ${slug}`);
            }
          }
        }

        for (const p of sourceProducts) {
          try {
            const { categories, tags } = getTermNames(p);
            const catTerms = await ensureTerms(dstCfg, "category", categories);
            const tagTerms = await ensureTerms(dstCfg, "tag", tags);

            const payload = buildWooPayloadFromWooProduct(p);
            payload.categories = catTerms;
            payload.tags = tagTerms;

            const existing = await findProductBySkuOrSlug(dstCfg, p.sku, p.slug);
            let saved: { id?: number; name?: string } = {};
            if (existing?.id) {
              logInfo("wp_write_payload", { requestId, op: "update", slug: p.slug, payload });
              logInfo("wp_write_attempt", {
                requestId,
                op: "update",
                slug: p.slug,
                name: payload?.name,
                type: payload?.type,
                sku: p?.sku,
                categories: catTerms.map((c: { name?: string; id?: number }) => c.name || c.id),
                tags: tagTerms.map((t: { name?: string; id?: number }) => t.name || t.id),
                imagesCount: Array.isArray(payload?.images) ? payload.images.length : 0,
              });
              const resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
              const ct = resp.headers.get("content-type") || "";
              if (!resp.ok || !ct.includes("application/json")) {
                const txt = await resp.text();
                await appendLog(userId, requestId, "error", `wooPut failed id=${existing.id} status=${resp.status} content-type=${ct} body=${txt.slice(0, 300)}`);
                logError("wp_write_failed", { requestId, op: "update", slug: p.slug, status: resp.status, contentType: ct, body: txt.slice(0, 300) });
                results.push({ slug: p.slug, error: `wooPut ${resp.status}` });
                await updateJob(userId, requestId, { processed: 1, error: 1 });
                continue;
              }
              try {
                saved = await resp.json();
              } catch (e: unknown) {
                const txt = await resp.text().catch(() => "");
                const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
                logError("wp_write_parse_failed", { requestId, op: "update", slug: p.slug, error: errorMessage, body: txt.slice(0, 300) });
                results.push({ slug: p.slug, error: `wooPut parse` });
                await updateJob(userId, requestId, { processed: 1, error: 1 });
                continue;
              }
              logInfo("wp_write_success", { requestId, op: "update", slug: p.slug, id: saved?.id, name: saved?.name });
            } else {
              logInfo("wp_write_payload", { requestId, op: "create", slug: p.slug, payload });
              logInfo("wp_write_attempt", {
                requestId,
                op: "create",
                slug: p.slug,
                name: payload?.name,
                type: payload?.type,
                sku: p?.sku,
                categories: catTerms.map((c: { name?: string; id?: number }) => c.name || c.id),
                tags: tagTerms.map((t: { name?: string; id?: number }) => t.name || t.id),
                imagesCount: Array.isArray(payload?.images) ? payload.images.length : 0,
              });
              const resp = await wooPost(dstCfg, "wp-json/wc/v3/products", { ...payload, slug: p.slug });
              const ct = resp.headers.get("content-type") || "";
              if (!resp.ok || !ct.includes("application/json")) {
                const txt = await resp.text();
                await appendLog(userId, requestId, "error", `wooPost failed slug=${p.slug} status=${resp.status} content-type=${ct} body=${txt.slice(0, 300)}`);
                logError("wp_write_failed", { requestId, op: "create", slug: p.slug, status: resp.status, contentType: ct, body: txt.slice(0, 300) });
                results.push({ slug: p.slug, error: `wooPost ${resp.status}` });
                await updateJob(userId, requestId, { processed: 1, error: 1 });
                continue;
              }
              try {
                saved = await resp.json();
              } catch (e: unknown) {
                const txt = await resp.text().catch(() => "");
                const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
                logError("wp_write_parse_failed", { requestId, op: "create", slug: p.slug, error: errorMessage, body: txt.slice(0, 300) });
                results.push({ slug: p.slug, error: `wooPost parse` });
                await updateJob(userId, requestId, { processed: 1, error: 1 });
                continue;
              }
              logInfo("wp_write_success", { requestId, op: "create", slug: p.slug, id: saved?.id, name: saved?.name });
            }
            if (((payload?.images || []) as Array<{ src: string }>).length === 0) {
              await appendLog(userId, requestId, "error", `no images parsed for ${p.slug}`);
              logError("wp_write_no_images", { requestId, slug: p.slug });
            }
            await appendLog(userId, requestId, "info", `saved product id=${saved?.id} name=${saved?.name} categories=${catTerms.length} tags=${tagTerms.length}`);
            logInfo("wp_write_saved_summary", { requestId, slug: p.slug, id: saved?.id, name: saved?.name, categories: catTerms.length, tags: tagTerms.length });

            const scraped = (p as WordPressProductPayload & { _scraped?: { variations?: VariationPost[] } })._scraped;
            if (scraped && saved?.id) {
              for (const v of scraped.variations || []) {
                const resp = await wooPost(dstCfg, `wp-json/wc/v3/products/${saved.id}/variations`, v);
                const ct = resp.headers.get("content-type") || "";
                if (!resp.ok || !ct.includes("application/json")) {
                  const txt = await resp.text();
                  await appendLog(userId, requestId, "error", `create variation failed product=${saved.id} status=${resp.status} content-type=${ct} body=${txt.slice(0, 300)}`);
                  continue;
                }
                try {
                  await resp.json();
                } catch (e: unknown) {
                  const txt = await resp.text().catch(() => "");
                  const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
                  await appendLog(userId, requestId, "error", `create variation parse failed product=${saved.id} err=${errorMessage} body=${txt.slice(0, 300)}`);
                }
              }
            } else if ((p.type || "simple") === "variable" && typeof p.id === "number" && saved?.id) {
              const vars = await fetchSourceVariations(srcCfg, p.id);
              for (const v of vars) {
                const vPayload: Record<string, unknown> = {
                  sku: v.sku,
                  regular_price: v.regular_price,
                  sale_price: v.sale_price,
                  image: v.image?.src ? { src: v.image.src } : undefined,
                  attributes: (v.attributes || []).map((a) => ({ name: a?.name, option: a?.option })),
                };
                const resp = await wooPost(dstCfg, `wp-json/wc/v3/products/${saved.id}/variations`, vPayload);
                const ct = resp.headers.get("content-type") || "";
                if (!resp.ok || !ct.includes("application/json")) {
                  const txt = await resp.text();
                  await appendLog(userId, requestId, "error", `create variation failed product=${saved.id} status=${resp.status} content-type=${ct} body=${txt.slice(0, 300)}`);
                  continue;
                }
                try {
                  await resp.json();
                } catch (e: unknown) {
                  const txt = await resp.text().catch(() => "");
                  const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
                  await appendLog(userId, requestId, "error", `create variation parse failed product=${saved.id} err=${errorMessage} body=${txt.slice(0, 300)}`);
                }
              }
            }

            results.push({ slug: p.slug, id: saved?.id, name: saved?.name });
            await updateJob(userId, requestId, { processed: 1, success: 1 });
            await recordResult(userId, "wordpress", requestId, String(p.slug || ""), saved?.name, saved?.id, "success");
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            results.push({ slug: p.slug, error: msg });
            await appendLog(userId, requestId, "error", `save failed slug=${p.slug} error=${msg}`);
            await updateJob(userId, requestId, { processed: 1, error: 1 });
          }
        }

        await finishJob(userId, requestId, "done");
        const okCnt = results.filter((r) => !r.error).length;
        const failCnt = results.filter((r) => r.error).length;
        await appendLog(userId, requestId, "info", `finish import total=${jobTotal} ok=${okCnt} fail=${failCnt}`);
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e || "未知错误");
        await appendLog(userId, requestId, "error", `job failed ${errorMessage}`);
        await finishJob(userId, requestId, "done");
      }
    }, 0);

    return NextResponse.json({ success: true, requestId, count: jobTotal }, { status: 202 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
async function createJob(userId: string, source: string, requestId: string, total: number) {
  const supabase = getSupabaseServer();
  if (!supabase) return;
  try {
    await supabase
      .from("import_jobs")
      .upsert({ 
        request_id: requestId, 
        user_id: userId, 
        source, 
        total, 
        processed: 0, 
        success_count: 0, 
        error_count: 0, 
        status: "processing" 
      });
  } catch {}
}
async function updateJob(_userId: string, _requestId: string, _updates: { processed?: number; success?: number; error?: number }) {
  void _userId; void _requestId; void _updates;
}
async function finishJob(_userId: string, _requestId: string, _status: "done" | "error") {
  void _userId; void _requestId; void _status;
}
