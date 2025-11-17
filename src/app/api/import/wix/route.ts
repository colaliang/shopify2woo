import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken, readLocalConfig } from "@/lib/supabaseServer";
import { discoverWixProductLinks } from "@/lib/wixScrape";
import { normalizeWpSlugOrLink } from "@/lib/wordpress";
 
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

    const q = pgmqQueueName("wix");
    const items = (mode === "all" ? discovered : links).map((l) => ({ userId, requestId, source: "wix", link: l, sourceUrl }));
    const chunk = 300;
    for (let i = 0; i < items.length; i += chunk) {
      await pgmqSendBatch(q, items.slice(i, i + chunk));
    }
    await appendLog(userId, requestId, "info", `pgmq queued ${jobTotal} links from ${sourceUrl}`);
    return NextResponse.json({ success: true, requestId, count: jobTotal }, { status: 202 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
