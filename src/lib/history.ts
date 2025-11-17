import { getSupabaseServer } from "./supabaseServer";

type Result = {
  requestId: string;
  userId: string;
  source: string;
  itemKey: string;
  name?: string;
  productId?: number;
  status: "success" | "error";
  createdAt: string;
};

type DbResultRow = {
  request_id: string;
  source: string;
  item_key: string;
  name?: string;
  product_id?: number;
  created_at: string;
};

const globalAny = globalThis as any;
function readLocal(): Result[] {
  try { return Array.isArray(globalAny.__importResults) ? globalAny.__importResults : []; } catch { return []; }
}
function writeLocal(arr: Result[]) {
  try { globalAny.__importResults = arr; } catch {}
}

export async function recordResult(userId: string, source: string, requestId: string, itemKey: string, name: string | undefined, productId: number | undefined, status: "success" | "error") {
  const supabase = getSupabaseServer();
  const now = new Date().toISOString();
  if (supabase) {
    await supabase.from("import_results").insert({ user_id: userId, request_id: requestId, source, item_key: itemKey, name, product_id: productId, status });
    return;
  }
  const arr = readLocal();
  arr.push({ userId, requestId, source, itemKey, name, productId, status, createdAt: now });
  writeLocal(arr);
}

export async function listResults(userId: string, page = 1, pageSize = 20) {
  const supabase = getSupabaseServer();
  if (supabase) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data } = await supabase
      .from("import_results")
      .select("request_id, source, item_key, name, product_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    return (data || []).map((d: DbResultRow) => ({ requestId: d.request_id, source: d.source, itemKey: d.item_key, name: d.name, productId: d.product_id, createdAt: d.created_at }));
  }
  const arr = readLocal().filter((r) => r.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const from = (page - 1) * pageSize;
  return arr.slice(from, from + pageSize);
}

export async function getResultCounts(userId: string, requestId: string) {
  const supabase = getSupabaseServer();
  if (supabase) {
    const { count: succ } = await supabase
      .from("import_results")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("request_id", requestId)
      .eq("status", "success");
    const { count: err } = await supabase
      .from("import_results")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("request_id", requestId)
      .eq("status", "error");
    const successCount = typeof succ === "number" ? succ : 0;
    const errorCount = typeof err === "number" ? err : 0;
    return { successCount, errorCount, processed: successCount + errorCount };
  }
  const arr = readLocal().filter((r) => r.userId === userId && r.requestId === requestId);
  const successCount = arr.filter((r) => r.status === "success").length;
  const errorCount = arr.filter((r) => r.status === "error").length;
  return { successCount, errorCount, processed: successCount + errorCount };
}
