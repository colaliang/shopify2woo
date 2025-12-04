import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken, readLocalConfig } from "@/lib/supabaseServer";
import { discoverWixProductLinks } from "@/lib/wixScrape";
import { normalizeWpSlugOrLink } from "@/lib/wordpress";
 
import { appendLog } from "@/lib/logs";
import { pgmqQueueName, pgmqSendBatch, pgmqPurgeRequest } from "@/lib/pgmq";

 


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
    
    // 0. Purge previous requests for this user to ensure clean state
    // This prevents old "stale" messages from blocking or mixing with new task
    // We don't know the specific old requestId, but we can purge based on user ownership if we had that capability.
    // Currently pgmqPurgeRequest takes a requestId.
    // Since we can't easily find all old requestIds without a DB query, we rely on the runner's "stale" check
    // AND we can try to find the LATEST stopped request from logs?
    // Actually, a better approach requested by user is "Clear queue".
    // We can use a wildcard or a special function.
    // For now, let's log that we are starting fresh.
    // Ideally, we should have a "cancel all for user" function.
    // But let's implement the "ID mismatch" logic in runner as requested, which handles the "old messages" problem.
    // However, to be safe, let's try to find the most recent request and cancel it if it's running.
    {
        const supabase = getSupabaseServer();
        if (supabase) {
            // Find recent request ID
             const { data: logs } = await supabase
                .from("import_logs")
                .select("request_id")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(1);
             if (logs && logs.length > 0) {
                 const oldId = logs[0].request_id;
                 if (oldId && oldId !== requestId) {
                     await appendLog(userId, requestId, "info", `Auto-cancelling previous request ${oldId}`);
                     // We invoke purge for the old ID
                     await pgmqPurgeRequest(oldId); 
                 }
             }
        }
    }

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
        .map((slug) => {
            if (/^https?:\/\//.test(slug)) return slug;
            const cleanSource = sourceUrl.replace(/\/+$/, "");
            // Avoid double slug appending if sourceUrl already ends with the slug
            if (cleanSource.endsWith(slug)) return cleanSource;
            return `${cleanSource}/${slug}`;
        });
      jobTotal = links.length;
    }

    const q = pgmqQueueName("wix");
    const items = (mode === "all" ? discovered : links).map((l) => ({ userId, requestId, source: "wix", link: l, sourceUrl }));
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
