import { getSupabaseServer } from "@/lib/supabaseServer";

export async function recordResult(
  userId: string,
  source: string,
  requestId: string,
  itemKey: string,
  name: string | undefined,
  productId: number | undefined,
  status: "success" | "error",
  message?: string,
  action?: string
) {
  const supabase = getSupabaseServer();
  if (!supabase) return;

  try {
    const data = {
      user_id: userId,
      request_id: requestId,
      source,
      item_key: itemKey,
      name: name || null,
      product_id: productId || null,
      status,
      message: message || null,
      action: action || null,
      // updating updated_at is good practice for upserts
      updated_at: new Date().toISOString(),
    };

    // We use upsert to handle potential re-runs or updates
    // Assuming a unique constraint exists on (request_id, item_key)
    const { error } = await supabase
      .from("import_results")
      .upsert(data, { onConflict: "request_id,item_key" });

    if (error) {
      // If specific constraint fails or doesn't exist, we might want to fallback to insert?
      // But usually upsert is safer. If onConflict is wrong, it might error.
      // Let's log it.
      console.error("[History] Failed to record result:", error);
    }
  } catch (e) {
    console.error("[History] Exception recording result:", e);
  }
}

export async function listResults(userId: string, page: number, limit: number, requestId?: string) {
  const supabase = getSupabaseServer();
  if (!supabase) return [];
  const offset = (page - 1) * limit;
  let q = supabase
    .from("import_results")
    .select("id, created_at, status, message, name, product_id, item_key")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId !== "__ALL__") {
    q = q.eq("user_id", userId);
  }
  if (requestId) {
    q = q.eq("request_id", requestId);
  }

  const { data } = await q;
  return (data || []).map((d: any) => ({
    id: d.id,
    timestamp: d.created_at,
    status: d.status,
    message: d.message,
    name: d.name,
    productId: d.product_id,
    itemKey: d.item_key,
  }));
}

export async function countResults(userId: string, requestId?: string) {
  const supabase = getSupabaseServer();
  if (!supabase) return 0;
  let q = supabase
    .from("import_results")
    .select("id", { count: "exact", head: true });

  if (userId !== "__ALL__") {
    q = q.eq("user_id", userId);
  }
  if (requestId) {
    q = q.eq("request_id", requestId);
  }

  const { count } = await q;
  return count || 0;
}

export async function getResultCounts(userId: string, requestId: string) {
  const supabase = getSupabaseServer();
  if (!supabase) return { successCount: 0, errorCount: 0, partialCount: 0, processed: 0, updateCount: 0 };

  // Helper to run count query
  const runCount = async (filter?: (q: any) => any) => {
    let q = supabase.from("import_results").select("id", { count: "exact", head: true });
    if (userId !== "__ALL__") q = q.eq("user_id", userId);
    q = q.eq("request_id", requestId);
    if (filter) q = filter(q);
    const { count } = await q;
    return count || 0;
  };

  const [successCount, errorCount, updateCount] = await Promise.all([
    runCount((q) => q.eq("status", "success")),
    runCount((q) => q.eq("status", "error")),
    runCount((q) => q.eq("action", "update").eq("status", "success")),
  ]);

  return {
    successCount,
    errorCount,
    partialCount: 0, // Currently we don't have partial status
    processed: successCount + errorCount,
    updateCount,
  };
}
