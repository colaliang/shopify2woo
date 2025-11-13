import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken, readLocalConfig } from "@/lib/supabaseServer";
import { fetchProductByHandle } from "@/lib/shopify";
import { buildWooProductPayload, buildVariationFromShopifyVariant } from "@/lib/importMap";
import { discoverShopifyHandles } from "@/lib/shopifyDiscover";
import { ensureTerms, findProductBySkuOrSlug, wooPost, wooPut } from "@/lib/woo";
import { createJob, updateJob, finishJob } from "@/lib/progress";
import { recordResult } from "@/lib/history";
import { pgmqQueueName, pgmqSendBatch } from "@/lib/pgmq";
import { appendLog } from "@/lib/logs";

export const runtime = "nodejs";

function normalizeHandleOrLink(value: string) {
  try {
    const u = new URL(value);
    const m = u.pathname.match(/\/products\/([^\/?#]+)/);
    if (m) return m[1];
  } catch {}
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { shopifyBaseUrl, productLinks, categories = [], tags = [], mode, cap } = body || {};
    if (!shopifyBaseUrl) {
      return NextResponse.json({ error: "缺少 Shopify 站点网址" }, { status: 400 });
    }
    const maxCap = typeof cap === "number" && cap > 0 ? Math.min(cap, 5000) : 1000;
    let handles = (Array.isArray(productLinks) ? productLinks : []).map(normalizeHandleOrLink).filter(Boolean);
    if (mode === "all") {
      handles = await discoverShopifyHandles(shopifyBaseUrl, maxCap);
    }
    if (!handles.length) {
      return NextResponse.json({ error: "未提供产品链接或 handle" }, { status: 400 });
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
    if (!wordpressUrl || !consumerKey || !consumerSecret) return NextResponse.json({ error: "Woo 配置未设置" }, { status: 400 });

    const wooCfg = { url: wordpressUrl, consumerKey, consumerSecret };

    const requestId = Math.random().toString(36).slice(2, 10);
    const supabase = getSupabaseServer();
    if (supabase) {
      if (process.env.USE_PGMQ === "1") {
        await supabase.from("import_jobs").upsert({ request_id: requestId, user_id: userId, source: "shopify", total: handles.length, processed: 0, success_count: 0, error_count: 0, status: "queued" }, { onConflict: "request_id" });
        const queue = pgmqQueueName("shopify");
        const msgs = handles.map((h: string) => ({ userId, requestId, source: "shopify", handle: h, shopifyBaseUrl, categories, tags }));
        const chunk = 500;
        for (let i = 0; i < msgs.length; i += chunk) {
          await pgmqSendBatch(queue, msgs.slice(i, i + chunk));
        }
        await appendLog(userId, requestId, "info", `pgmq queued ${handles.length} from ${shopifyBaseUrl}`);
        return NextResponse.json({ success: true, requestId, count: handles.length }, { status: 202 });
      } else {
        const params = { shopifyBaseUrl, handles, categories, tags } as any;
        await supabase.from("import_jobs").upsert({ request_id: requestId, user_id: userId, source: "shopify", total: handles.length, processed: 0, success_count: 0, error_count: 0, status: "queued", params }, { onConflict: "request_id" });
        await appendLog(userId, requestId, "info", `queued import from ${shopifyBaseUrl}, total ${handles.length}`);
        return NextResponse.json({ success: true, requestId, count: handles.length }, { status: 202 });
      }
    }

    await createJob(userId, "shopify", requestId, handles.length);
    await appendLog(userId, requestId, "info", `queued import from ${shopifyBaseUrl}, total ${handles.length}`);

    setTimeout(async () => {
      try {
        // 确保分类与标签
        const catTerms = await ensureTerms(wooCfg, "category", categories);
        const tagTerms = await ensureTerms(wooCfg, "tag", tags);
        const results: Array<{ handle: string; id?: number; name?: string; error?: string }> = [];
        for (const handle of handles) {
          await appendLog(userId, requestId, "info", `fetch product handle=${handle}`);
          const product = await fetchProductByHandle(shopifyBaseUrl, handle);
          if (!product) {
            results.push({ handle, error: "Shopify 产品未找到" });
            await updateJob(userId, requestId, { processed: 1, error: 1 });
            await appendLog(userId, requestId, "error", `not found handle=${handle}`);
            continue;
          }
          await appendLog(userId, requestId, "info", `fetched handle=${handle} images=${(product.images||[]).length} variants=${(product.variants||[]).length}`);
          const payload = buildWooProductPayload(product);
          payload.categories = catTerms;
          payload.tags = tagTerms;

          const existing = await findProductBySkuOrSlug(wooCfg, undefined, product.handle);
          let saved: { id?: number; name?: string };
          if (existing) {
            saved = await (await wooPut(wooCfg, `wp-json/wc/v3/products/${existing.id}`, payload)).json();
          } else {
            saved = await (await wooPost(wooCfg, "wp-json/wc/v3/products", { ...payload, slug: product.handle })).json();
          }
          await appendLog(userId, requestId, "info", `saved product id=${saved?.id} name=${saved?.name} variants=${(product.variants||[]).length} images=${(product.images||[]).length}`);

          if (Array.isArray(product.variants) && product.variants.length > 1) {
            for (const v of product.variants) {
              const varPayload = buildVariationFromShopifyVariant(v);
              await wooPost(wooCfg, `wp-json/wc/v3/products/${saved.id}/variations`, varPayload).then((r) => r.json());
            }
          }

          results.push({ handle, id: saved?.id, name: saved?.name });
          await updateJob(userId, requestId, { processed: 1, success: 1 });
          await recordResult(userId, "shopify", requestId, product.handle, saved?.name, saved?.id, "success");
        }
        await finishJob(userId, requestId, "done");
        await appendLog(userId, requestId, "info", `finish import total=${handles.length}`);
      } catch (e: any) {
        await appendLog(userId, requestId, "error", `job failed ${e?.message || e}`);
        await finishJob(userId, requestId, "done");
      }
    }, 0);

    return NextResponse.json({ success: true, requestId, count: handles.length }, { status: 202 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
