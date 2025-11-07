import { NextResponse } from "next/server";
import { getSupabaseServer, readLocalConfig } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    if (supabase) {
      const { data, error } = await supabase
        .from("user_configs")
        .select("wordpress_url, consumer_key, consumer_secret")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        return NextResponse.json({ success: true, data: {
          wordpressUrl: data.wordpress_url || "",
          consumerKey: data.consumer_key || "",
          consumerSecret: data.consumer_secret || "",
        } });
      }
    }
  } catch {
    // ignore and fallback
  }

  const local = readLocalConfig();
  return NextResponse.json({
    success: true,
    data: {
      wordpressUrl: local?.wordpressUrl || "",
      consumerKey: local?.consumerKey || "",
      consumerSecret: local?.consumerSecret || "",
    },
  });
}