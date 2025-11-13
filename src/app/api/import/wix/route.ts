import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken, readLocalConfig } from "@/lib/supabaseServer";
import { ensureTerms, findProductBySkuOrSlug, wooPost, wooPut } from "@/lib/woo";
import { fetchHtml } from "@/lib/wordpressScrape";
import { buildWixPayload, discoverWixProductLinks } from "@/lib/wixScrape";
import { normalizeWpSlugOrLink } from "@/lib/wordpress";
import { createJob, updateJob, finishJob } from "@/lib/progress";
import { recordResult } from "@/lib/history";
import { appendLog } from "@/lib/logs";
import { pgmqQueueName, pgmqSendBatch } from "@/lib/pgmq";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sourceUrl, mode, productLinks = [], cap } = body || {};
    if (mode !== "all" && mode !== "links") return NextResponse.json({ error: "缺少或非法导入模式" }, { status: 400 });
    if (!sourceUrl) return NextResponse.json({ error: "需提供源站 URL" }, { status: 400 });

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

    const dstCfg = { url: wordpressUrl, consumerKey, consumerSecret };
    const maxCap = typeof cap === "number" && cap > 0 ? Math.min(cap, 5000) : 1000;
    const requestId = Math.random().toString(36).slice(2, 10);

    let jobTotal = 0;
    let discovered: string[] = [];
    let links: string[] = [];
    if (mode === "all") {
      discovered = await discoverWixProductLinks(sourceUrl, maxCap);
      jobTotal = discovered.length;
    } else {
      links = (Array.isArray(productLinks) ? productLinks : [])
        .map((s: string) => normalizeWpSlugOrLink(String(s || "")))
        .filter(Boolean)
        .map((slug) => (/^https?:\/\//.test(slug) ? slug : `${sourceUrl.replace(/\/$/, "")}/${slug}`));
      jobTotal = links.length;
    }

    const supabase = getSupabaseServer();
    if (supabase) {
      if (process.env.USE_PGMQ === "1") {
        await supabase.from("import_jobs").upsert({ request_id: requestId, user_id: userId, source: "wix", total: jobTotal, processed: 0, success_count: 0, error_count: 0, status: "queued" }, { onConflict: "request_id" });
        const q = pgmqQueueName("wix");
        const items = (mode === "all" ? discovered : links).map((l) => ({ userId, requestId, source: "wix", link: l, sourceUrl }));
        const chunk = 300;
        for (let i = 0; i < items.length; i += chunk) {
          await pgmqSendBatch(q, items.slice(i, i + chunk));
        }
        await appendLog(userId, requestId, "info", `pgmq queued ${jobTotal} links from ${sourceUrl}`);
        return NextResponse.json({ success: true, requestId, count: jobTotal }, { status: 202 });
      } else {
        const params = { sourceUrl, links: mode === "all" ? discovered : links } as any;
        await supabase.from("import_jobs").upsert({ request_id: requestId, user_id: userId, source: "wix", total: jobTotal, processed: 0, success_count: 0, error_count: 0, status: "queued", params }, { onConflict: "request_id" });
        await appendLog(userId, requestId, "info", mode === "all" ? `queued ${jobTotal} links from ${sourceUrl}` : `queued ${jobTotal} links by request`);
        return NextResponse.json({ success: true, requestId, count: jobTotal }, { status: 202 });
      }
    }

    await createJob(userId, "wix", requestId, jobTotal);
    await appendLog(userId, requestId, "info", mode === "all" ? `discover ${jobTotal} links from ${sourceUrl}` : `links ${jobTotal}`);

    setTimeout(async () => {
      try {
        const results: Array<{ slug?: string; id?: number; name?: string; error?: string }> = [];
        const sourceProducts: Array<{ slug: string; payload: Record<string, unknown>; categories: string[]; tags: string[] }> = [];
        const iterate = mode === "all" ? discovered : links;
        for (const link of iterate) {
          try {
            const html = await fetchHtml(link);
            const mapped = buildWixPayload(link, html);
            const slug = normalizeWpSlugOrLink(link);
            await appendLog(userId, requestId, "info", `parsed ${link} imgs=${(((mapped.payload as any)?.images)||[]).length} attrs=${(((mapped.payload as any)?.attributes)||[]).length} desc=${(((mapped.payload as any)?.description)||"").length}`);
            sourceProducts.push({ slug, payload: mapped.payload as any, categories: mapped.categories, tags: mapped.tags });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            results.push({ slug: normalizeWpSlugOrLink(link), error: msg });
            await appendLog(userId, requestId, "error", `parse failed ${link}: ${msg}`);
            await updateJob(userId, requestId, { processed: 1, error: 1 });
          }
        }

        for (const p of sourceProducts) {
          try {
            const catTerms = await ensureTerms(dstCfg, "category", p.categories);
            const tagTerms = await ensureTerms(dstCfg, "tag", p.tags);
            const payload = { ...p.payload, categories: catTerms, tags: tagTerms } as any;
            const existing = await findProductBySkuOrSlug(dstCfg, undefined, p.slug);
            let saved: { id?: number; name?: string } = {};
            if (existing?.id) {
              const resp = await wooPut(dstCfg, `wp-json/wc/v3/products/${existing.id}`, payload);
              const ct = resp.headers.get("content-type") || "";
              if (!resp.ok || !ct.includes("application/json")) {
                const txt = await resp.text();
                await appendLog(userId, requestId, "error", `wooPut failed id=${existing.id} status=${resp.status} content-type=${ct} body=${txt.slice(0,300)}`);
                results.push({ slug: p.slug, error: `wooPut ${resp.status}` });
                await updateJob(userId, requestId, { processed: 1, error: 1 });
                continue;
              }
              try { saved = await resp.json(); } catch {}
            } else {
              const resp = await wooPost(dstCfg, "wp-json/wc/v3/products", { ...payload, slug: p.slug });
              const ct = resp.headers.get("content-type") || "";
              if (!resp.ok || !ct.includes("application/json")) {
                const txt = await resp.text();
                await appendLog(userId, requestId, "error", `wooPost failed slug=${p.slug} status=${resp.status} content-type=${ct} body=${txt.slice(0,300)}`);
                results.push({ slug: p.slug, error: `wooPost ${resp.status}` });
                await updateJob(userId, requestId, { processed: 1, error: 1 });
                continue;
              }
              try { saved = await resp.json(); } catch {}
            }
            await appendLog(userId, requestId, "info", `saved product id=${saved?.id} name=${saved?.name}`);
            await updateJob(userId, requestId, { processed: 1, success: 1 });
            await recordResult(userId, "wix", requestId, p.slug, saved?.name, saved?.id, "success");
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            results.push({ slug: p.slug, error: msg });
            await appendLog(userId, requestId, "error", `save failed slug=${p.slug} error=${msg}`);
            await updateJob(userId, requestId, { processed: 1, error: 1 });
          }
        }

        await finishJob(userId, requestId, "done");
        await appendLog(userId, requestId, "info", `finish import total=${sourceProducts.length}`);
      } catch (e: any) {
        await appendLog(userId, requestId, "error", `job failed ${e?.message || e}`);
        await finishJob(userId, requestId, "done");
      }
    }, 0);

    return NextResponse.json({ success: true, requestId, count: jobTotal }, { status: 202 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
