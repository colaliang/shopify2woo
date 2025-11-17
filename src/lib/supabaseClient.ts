import { createClient } from "@supabase/supabase-js";

let cached: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowser() {
  if (typeof window === "undefined") return null;
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  if (!url || !key) return null;
  const globalAny = globalThis as any;
  if (globalAny.__supabaseClient) {
    cached = globalAny.__supabaseClient;
    return cached;
  }
  cached = createClient(url, key);
  globalAny.__supabaseClient = cached;
  return cached;
}
