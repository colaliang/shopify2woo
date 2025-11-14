import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken, readLocalConfig, writeLocalConfig } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = await getUserIdFromToken(token);
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const local = readLocalConfig(userId);
    const hasLocal = !!(local?.wordpressUrl || local?.consumerKey || local?.consumerSecret);
    if (hasLocal) {
      return NextResponse.json({ success: true, data: {
        wordpressUrl: local?.wordpressUrl || "",
        consumerKey: local?.consumerKey || "",
        consumerSecret: local?.consumerSecret || "",
      }, source: "local" });
    }
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "服务未配置" }, { status: 500 });
    const { data, error } = await supabase
      .from("user_configs")
      .select("wordpress_url, consumer_key, consumer_secret")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const cfg = {
      wordpressUrl: data?.wordpress_url || "",
      consumerKey: data?.consumer_key || "",
      consumerSecret: data?.consumer_secret || "",
    };
    const hasRemote = !!(cfg.wordpressUrl || cfg.consumerKey || cfg.consumerSecret);
    if (hasRemote) writeLocalConfig(cfg, userId);
    return NextResponse.json({ success: true, data: cfg, source: hasRemote ? "supabase" : "empty" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
