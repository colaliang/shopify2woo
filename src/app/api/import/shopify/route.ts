import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken, readLocalConfig } from "@/lib/supabaseServer";
import { fetchProductByHandle } from "@/lib/shopify";
import { buildWooProductPayload, buildVariationFromShopifyVariant } from "@/lib/importMap";
import { discoverShopifyHandles } from "@/lib/shopifyDiscover";
// import-jobs 相关逻辑已移除，仅保留 PGMQ 队列处理
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
    if (!supabase || process.env.USE_PGMQ !== "1") {
      return NextResponse.json({ error: "PGMQ 未启用或服务未配置" }, { status: 500 });
    }
    const queue = pgmqQueueName("shopify");
    const msgs = handles.map((h: string) => ({ userId, requestId, source: "shopify", handle: h, shopifyBaseUrl, categories, tags }));
    const chunk = 500;
    for (let i = 0; i < msgs.length; i += chunk) {
      await pgmqSendBatch(queue, msgs.slice(i, i + chunk));
    }
    await appendLog(userId, requestId, "info", `pgmq queued ${handles.length} from ${shopifyBaseUrl}`);
    return NextResponse.json({ success: true, requestId, count: handles.length }, { status: 202 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
