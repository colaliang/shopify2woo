import { NextResponse } from "next/server";
import { getSupabaseServer, writeLocalConfig } from "@/lib/supabaseServer";

// 占位保存：仅回显，不进行持久化
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { wordpressUrl, consumerKey, consumerSecret } = body || {};
    if (!wordpressUrl || !consumerKey || !consumerSecret) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    // 优先写入 Supabase
    try {
      const supabase = getSupabaseServer();
      if (supabase) {
        const { error } = await supabase
          .from("user_configs")
          .upsert({
            wordpress_url: wordpressUrl,
            consumer_key: consumerKey,
            consumer_secret: consumerSecret,
          }, { onConflict: "id" });
        if (error) throw error;
        return NextResponse.json({ success: true });
      }
    } catch {
      // 回退到本地文件
      const ok = writeLocalConfig({ wordpressUrl, consumerKey, consumerSecret });
      if (!ok) return NextResponse.json({ error: "本地配置写入失败" }, { status: 500 });
      return NextResponse.json({ success: true, fallback: true });
    }

    // 无 Supabase 情况的直接回退
    const ok = writeLocalConfig({ wordpressUrl, consumerKey, consumerSecret });
    if (!ok) return NextResponse.json({ error: "本地配置写入失败" }, { status: 500 });
    return NextResponse.json({ success: true, fallback: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}