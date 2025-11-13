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
  fetchHtml,
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
import { createJob, updateJob, finishJob } from "@/lib/progress";
import { recordResult } from "@/lib/history";
import { appendLog } from "@/lib/logs";
import { logInfo, logError } from "@/lib/terminal";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      sourceUrl,
      sourceKey,
      sourceSecret,
      mode,
      productLinks = [],
      cap,
    } = body || {};

    if (mode !== "all" && mode !== "links") {
      return NextResponse.json({ error: "缺少或非法导入模式" }, { status: 400 });
    }
    if (mode === "all" && !sourceUrl) {
      return NextResponse.json({ error: "全站模式需提供源站 URL" }, { status: 400 });
    }

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

    const results: Array<{ slug?: string; id?: number; name?: string; error?: string }> = [];

    const sourceProducts = [] as Awaited<ReturnType<typeof fetchSourceProductsAll>>;
    const maxCap = typeof cap === "number" && cap > 0 ? Math.min(cap, 5000) : 1000;
    let requestId = Math.random().toString(36).slice(2, 10);
    let jobTotal = 0;
    if (mode === "all") {
      const discovered = await discoverAllProductLinks(sourceUrl, maxCap);
      await createJob(userId, "wordpress", requestId, discovered.length);
      jobTotal = discovered.length;
      await appendLog(userId, requestId, "info", `discover ${discovered.length} links from ${sourceUrl}`);
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
          let absImages = (((mapped.payload as any)?.images || []) as Array<{src:string}>).map((i)=>({ src: new URL(i.src, link).toString() }));
          if (!absImages.length) {
            const ogs = extractOgImages(html);
            const contents = extractContentImages(html);
            const merged = Array.from(new Set([...ogs, ...contents])).map(u => ({ src: new URL(u, link).toString() }));
            absImages = merged;
          }
          await appendLog(userId, requestId, "info", `parsed ${link} imgs=${absImages.length} attrs=${((mapped.payload as any)?.attributes||[]).length} desc=${(ld?.description||extractDescriptionHtml(html)||"").length} sku=${ld?.sku||extractSku(html)||""}`);
          sourceProducts.push({
              id: undefined,
              name: String(ld?.name || slug),
              slug,
              type: vars.length > 1 ? "variable" : "simple",
              sku: ld?.sku || extractSku(html),
              description: ld?.description || extractDescriptionHtml(html) || "",
              short_description: extractDescriptionHtml(html) || undefined,
              images: absImages.length ? absImages : extractGalleryImages(html).map((src)=>({src: new URL(src, link).toString()})),
              attributes: (mapped.payload as any)?.attributes || [],
              default_attributes: (mapped.payload as any)?.default_attributes || [],
              categories: cats.map((n) => ({ name: n })),
              tags: tags.map((n) => ({ name: n })),
            } as any);
          (sourceProducts as any)[sourceProducts.length - 1]._scraped = mapped;
          await appendLog(userId, requestId, "info", `parsed ${link}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          results.push({ slug: normalizeWpSlugOrLink(link), error: msg });
          await appendLog(userId, requestId, "error", `parse failed ${link}: ${msg}`);
          await updateJob(userId, requestId, { processed: 1, error: 1 });
        }
      }
    } else {
      const links = (Array.isArray(productLinks) ? productLinks : [])
        .map((s: string) => normalizeWpSlugOrLink(String(s || "")))
        .filter(Boolean);
      await createJob(userId, "wordpress", requestId, links.length);
      jobTotal = links.length;
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
            let absImages2 = (((mapped.payload as any)?.images || []) as Array<{src:string}>).map((i)=>({ src: new URL(i.src, linkUrl).toString() }));
            if (!absImages2.length) {
              const ogs = extractOgImages(html);
              const contents = extractContentImages(html);
              const merged = Array.from(new Set([...ogs, ...contents])).map(u => ({ src: new URL(u, linkUrl).toString() }));
              absImages2 = merged;
            }
            await appendLog(userId, requestId, "info", `parsed ${linkUrl} imgs=${absImages2.length} attrs=${((mapped.payload as any)?.attributes||[]).length} desc=${(ld?.description||extractDescriptionHtml(html)||"").length} sku=${ld?.sku||extractSku(html)||""}`);
          sourceProducts.push({
              id: undefined,
              name: String(ld?.name || slug),
              slug,
              type: vars.length > 1 ? "variable" : "simple",
              sku: ld?.sku || extractSku(html),
              description: ld?.description || extractDescriptionHtml(html) || "",
              short_description: extractDescriptionHtml(html) || undefined,
              images: absImages2.length ? absImages2 : extractGalleryImages(html).map((src)=>({src: new URL(src, linkUrl).toString()})),
              attributes: (mapped.payload as any)?.attributes || [],
              default_attributes: (mapped.payload as any)?.default_attributes || [],
              categories: cats.map((n) => ({ name: n })),
              tags: tags.map((n) => ({ name: n })),
            } as any);
            (sourceProducts as any)[sourceProducts.length - 1]._scraped = mapped;
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

        let payload = buildWooPayloadFromWooProduct(p);
        (payload as any).categories = catTerms;
        (payload as any).tags = tagTerms;

        const existing = await findProductBySkuOrSlug(dstCfg, p.sku, p.slug);
        let saved: { id?: number; name?: string } = {};
        if (existing?.id) {
          logInfo("wp_write_payload", { requestId, op: "update", slug: p.slug, payload });
          logInfo("wp_write_attempt", {
            requestId,
            op: "update",
            slug: p.slug,
            name: (payload as any)?.name,
            type: (payload as any)?.type,
            sku: (p as any)?.sku,
            categories: catTerms.map((c:any)=>c.name||c.id),
            tags: tagTerms.map((t:any)=>t.name||t.id),
            imagesCount: ((payload as any)?.images||[]).length,
          });
          const resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
          const ct = resp.headers.get("content-type") || "";
          if (!resp.ok || !ct.includes("application/json")) {
            const txt = await resp.text();
            await appendLog(userId, requestId, "error", `wooPut failed id=${existing.id} status=${resp.status} content-type=${ct} body=${txt.slice(0,300)}`);
            logError("wp_write_failed", { requestId, op: "update", slug: p.slug, status: resp.status, contentType: ct, body: txt.slice(0,300) });
            results.push({ slug: p.slug, error: `wooPut ${resp.status}` });
            await updateJob(userId, requestId, { processed: 1, error: 1 });
            continue;
          }
          try {
            saved = await resp.json();
          } catch (e: any) {
            const txt = await resp.text().catch(()=>"");
            logError("wp_write_parse_failed", { requestId, op: "update", slug: p.slug, error: e?.message||String(e), body: txt.slice(0,300) });
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
            name: (payload as any)?.name,
            type: (payload as any)?.type,
            sku: (p as any)?.sku,
            categories: catTerms.map((c:any)=>c.name||c.id),
            tags: tagTerms.map((t:any)=>t.name||t.id),
            imagesCount: ((payload as any)?.images||[]).length,
          });
          const resp = await wooPost(dstCfg, "wp-json/wc/v3/products", { ...payload, slug: p.slug });
          const ct = resp.headers.get("content-type") || "";
          if (!resp.ok || !ct.includes("application/json")) {
            const txt = await resp.text();
            await appendLog(userId, requestId, "error", `wooPost failed slug=${p.slug} status=${resp.status} content-type=${ct} body=${txt.slice(0,300)}`);
            logError("wp_write_failed", { requestId, op: "create", slug: p.slug, status: resp.status, contentType: ct, body: txt.slice(0,300) });
            results.push({ slug: p.slug, error: `wooPost ${resp.status}` });
            await updateJob(userId, requestId, { processed: 1, error: 1 });
            continue;
          }
          try {
            saved = await resp.json();
          } catch (e: any) {
            const txt = await resp.text().catch(()=>"");
            logError("wp_write_parse_failed", { requestId, op: "create", slug: p.slug, error: e?.message||String(e), body: txt.slice(0,300) });
            results.push({ slug: p.slug, error: `wooPost parse` });
            await updateJob(userId, requestId, { processed: 1, error: 1 });
            continue;
          }
          logInfo("wp_write_success", { requestId, op: "create", slug: p.slug, id: saved?.id, name: saved?.name });
        }
        if (((payload as any)?.images || []).length === 0) {
          await appendLog(userId, requestId, "error", `no images parsed for ${p.slug}`);
          logError("wp_write_no_images", { requestId, slug: p.slug });
        }
        await appendLog(userId, requestId, "info", `saved product id=${saved?.id} name=${saved?.name} categories=${catTerms.length} tags=${tagTerms.length}`);
        logInfo("wp_write_saved_summary", { requestId, slug: p.slug, id: saved?.id, name: saved?.name, categories: catTerms.length, tags: tagTerms.length });

        const scraped = (p as any)._scraped;
        if (scraped && saved?.id) {
          for (const v of scraped.variations || []) {
            const resp = await wooPost(dstCfg, `wp-json/wc/v3/products/${saved.id}/variations`, v);
            const ct = resp.headers.get("content-type") || "";
            if (!resp.ok || !ct.includes("application/json")) {
              const txt = await resp.text();
              await appendLog(userId, requestId, "error", `create variation failed product=${saved.id} status=${resp.status} content-type=${ct} body=${txt.slice(0,300)}`);
              continue;
            }
            try { await resp.json(); } catch (e: any) {
              const txt = await resp.text().catch(()=>"");
              await appendLog(userId, requestId, "error", `create variation parse failed product=${saved.id} err=${e?.message||e} body=${txt.slice(0,300)}`);
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
              await appendLog(userId, requestId, "error", `create variation failed product=${saved.id} status=${resp.status} content-type=${ct} body=${txt.slice(0,300)}`);
              continue;
            }
            try { await resp.json(); } catch (e: any) {
              const txt = await resp.text().catch(()=>"");
              await appendLog(userId, requestId, "error", `create variation parse failed product=${saved.id} err=${e?.message||e} body=${txt.slice(0,300)}`);
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
    const okCnt = results.filter(r => !r.error).length;
    const failCnt = results.filter(r => r.error).length;
    await appendLog(userId, requestId, "info", `finish import total=${jobTotal} ok=${okCnt} fail=${failCnt}`);
    return NextResponse.json({ success: true, requestId, count: results.length, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
