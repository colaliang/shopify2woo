import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken, writeLocalConfig } from "@/lib/supabaseServer";

// 占位保存：仅回显，不进行持久化
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { wordpressUrl, consumerKey, consumerSecret } = body || {};
    if (!wordpressUrl || !consumerKey || !consumerSecret) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = await getUserIdFromToken(token);
    const supabase = getSupabaseServer();
    if (!supabase || !userId) {
      writeLocalConfig({ wordpressUrl, consumerKey, consumerSecret });
      return NextResponse.json({ success: true, source: "local" });
    }
    const { error } = await supabase
      .from("user_configs")
      .upsert({
        user_id: userId,
        wordpress_url: wordpressUrl,
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }, { onConflict: "user_id" });
    if (error) throw error;
    writeLocalConfig({ wordpressUrl, consumerKey, consumerSecret }, userId);
    return NextResponse.json({ success: true, source: "supabase" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
