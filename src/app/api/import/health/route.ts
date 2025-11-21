import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { pgmqQueueName, pgmqQsize } from "@/lib/pgmq";
export const runtime = "nodejs";

function auth(req: Request) {
  if (process.env.RUNNER_ALLOW_ANON === "1") return true;
  const token = process.env.RUNNER_TOKEN || "";
  if (!token) return true;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const url = new URL(req.url);
  const qp = url.searchParams.get("token") || "";
  if (qp && qp === token) return true;
  if (bearer && bearer === token) return true;
  return false;
}

export async function GET(req: Request) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const env = {
    supabase_server_url: !!process.env.SUPABASE_URL,
    supabase_server_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabase_client_url: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
    supabase_client_key: !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
    runner_token: !!process.env.RUNNER_TOKEN,
    image_cache_bucket: process.env.IMAGE_CACHE_BUCKET || "import-images",
  };
  const reasons: string[] = [];
  if (!env.supabase_server_url) reasons.push("missing SUPABASE_URL");
  if (!env.supabase_server_key) reasons.push("missing SUPABASE_SERVICE_ROLE_KEY");
  if (!env.runner_token) reasons.push("missing RUNNER_TOKEN");
  const supabase = getSupabaseServer();
  let storage_access = false;
  try {
    if (supabase) {
      const { error } = await supabase.storage.from(env.image_cache_bucket).list("by-url", { limit: 1 });
      storage_access = !error;
    }
  } catch {
    storage_access = false;
  }
  let pgmq_rpc = false;
  try {
    const qn = pgmqQueueName("wordpress");
    const sz = await pgmqQsize(qn);
    pgmq_rpc = sz !== null;
  } catch {
    pgmq_rpc = false;
  }
  const ok = env.supabase_server_url && env.supabase_server_key;
  return NextResponse.json({ ok, env, supabase: { storage_access, pgmq_rpc }, reasons, ts: new Date().toISOString() });
}