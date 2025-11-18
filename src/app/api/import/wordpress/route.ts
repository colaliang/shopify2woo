import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken, readLocalConfig } from "@/lib/supabaseServer";
import { normalizeWpSlugOrLink } from "@/lib/wordpress";
import { discoverAllProductLinks } from "@/lib/wordpressScrape";
 
import { appendLog } from "@/lib/logs";
import { pgmqQueueName, pgmqSendBatch } from "@/lib/pgmq";


export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sourceUrl, mode, productLinks = [], cap, priority } = body || {};
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

    

    const maxCap = typeof cap === "number" && cap > 0 ? Math.min(cap, 5000) : 1000;
    const requestId = Math.random().toString(36).slice(2, 10);

    let jobTotal = 0;
    let discovered: string[] = [];
    let links: string[] = [];
    if (mode === "all") {
      discovered = await discoverAllProductLinks(sourceUrl, maxCap);
      // 预处理：去重与格式校验
      discovered = Array.from(new Set(discovered)).filter((u) => /^https?:\/\//.test(u));
      jobTotal = discovered.length;
    } else {
      // 预处理：类型、去重、标准化
      const arr = Array.isArray(productLinks) ? productLinks : [];
      links = Array.from(new Set(arr.map((s: string) => normalizeWpSlugOrLink(String(s || "")))))
        .filter(Boolean);
      jobTotal = links.length;
    }

    const q = pgmqQueueName(priority === "high" ? "wordpress_high" : "wordpress");
    const items = (mode === "all" ? discovered : links).map((l) => ({ userId, requestId, source: "wordpress", priority: priority === "high" ? "high" : "normal", link: /^https?:\/\//.test(l) ? l : new URL(l, sourceUrl).toString(), sourceUrl }));
    try {
      const chunk = 300;
      let sent = 0;
      for (let i = 0; i < items.length; i += chunk) {
        const batch = items.slice(i, i + chunk);
        await pgmqSendBatch(q, batch);
        sent += batch.length;
      }
      await appendLog(userId, requestId, "info", `pgmq queued ${sent}/${jobTotal} links from ${sourceUrl} q=${q}`);
      return NextResponse.json({ success: true, requestId, count: jobTotal }, { status: 202 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
      await appendLog(userId, requestId, "error", `pgmq enqueue failed q=${q}: ${msg}`);
      return NextResponse.json({ error: `enqueue_failed: ${msg}` }, { status: 500 });
    }

    
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
