import { createHash } from "crypto";
import { getSupabaseServer } from "./supabaseServer";

type ImportCacheRow = {
  url: string;
  raw_hash?: string;
  result_json?: unknown;
  created_at: string;
  updated_at: string;
};

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function md5(input: string) {
  return createHash("md5").update(input).digest("hex");
}

export function isCacheValid(row: ImportCacheRow, maxDays = 7) {
  const base = row.updated_at || row.created_at;
  const t = new Date(base).getTime();
  const now = Date.now();
  const days = 24 * 60 * 60 * 1000 * maxDays;
  return now - t < days;
}

export async function getImportCache(url: string): Promise<ImportCacheRow | null> {
  const supabase = getSupabaseServer();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("import_cache")
      .select("url, raw_hash, result_json, created_at, updated_at")
      .eq("url", url)
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

export async function saveImportCache(url: string, rawHash: string, resultJson: unknown) {
  const supabase = getSupabaseServer();
  if (!supabase) return false;
  const now = new Date().toISOString();
  try {
    const { data: existing } = await supabase
      .from("import_cache")
      .select("url")
      .eq("url", url)
      .limit(1)
      .maybeSingle();
    if (existing && existing.url) {
      const { error } = await supabase
        .from("import_cache")
        .update({ raw_hash: rawHash, result_json: resultJson, updated_at: now })
        .eq("url", url);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("import_cache")
        .insert({ url, raw_hash: rawHash, result_json: resultJson, created_at: now, updated_at: now });
      if (error) throw error;
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteExpiredImportCache(maxDays = 7) {
  const supabase = getSupabaseServer();
  if (!supabase) return 0;
  const t = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { error } = await supabase
      .from("import_cache")
      .delete()
      .lt("updated_at", t);
    if (error) throw error;
    return 1;
  } catch {
    return 0;
  }
}