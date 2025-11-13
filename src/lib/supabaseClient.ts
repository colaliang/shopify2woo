import { createClient } from "@supabase/supabase-js";

export function getSupabaseBrowser() {
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  if (!url || !key) return null;
  return createClient(url, key);
}
