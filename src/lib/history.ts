import { getSupabaseServer } from "@/lib/supabaseServer";
import { appendLog } from "@/lib/logs";

export async function recordResult(
  userId: string,
  source: string,
  requestId: string,
  itemKey: string,
  name: string | undefined,
  productId: number | undefined,
  status: "success" | "error",
  message?: string,
  action?: string,
  destUrl?: string,
  imageUrl?: string,
  price?: string,
  galleryCount?: number,
  categories?: string[]
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
      dest_url: destUrl || null,
      image_url: imageUrl || null,
      price: price || null,
      gallery_count: galleryCount || 0,
      categories: categories ? JSON.stringify(categories) : null,
      // updating updated_at is good practice for upserts
      updated_at: new Date().toISOString(),
    };

    // We use manual check-then-update/insert to be robust against unknown unique constraints
    // (upsert with onConflict requires exact match of constraint columns)
    const { data: existing } = await supabase
      .from("import_results")
      .select("id")
      .eq("request_id", requestId)
      .eq("item_key", itemKey)
      .maybeSingle();

    if (existing) {
       const { error: updateErr } = await supabase
         .from("import_results")
         .update({ ...data, id: undefined }) // don't update ID
         .eq("id", existing.id);
       if (updateErr) throw updateErr;
    } else {
       const { error: insertErr } = await supabase
         .from("import_results")
         .insert(data);
       // If insert fails with unique violation, it means race condition -> try update again
       if (insertErr && (insertErr.code === '23505' || insertErr.message.includes('unique'))) {
           const { error: retryErr } = await supabase
             .from("import_results")
             .update({ ...data, id: undefined })
             .eq("request_id", requestId)
             .eq("item_key", itemKey);
           if (retryErr) throw retryErr;
       } else if (insertErr) {
           throw insertErr;
       }
    }
  } catch (e) {
    const errText = `Exception recording result: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[History] ${errText}`);
    try {
      await appendLog(userId, requestId, "error", errText);
    } catch {}
  }
}

export async function listResults(userId: string, page: number, limit: number, requestId?: string) {
  const supabase = getSupabaseServer();
  if (!supabase) return [];
  const offset = (page - 1) * limit;
  let q = supabase
    .from("import_results")
    .select("id, request_id, created_at, status, message, name, product_id, item_key, dest_url, image_url, price, gallery_count, categories")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId !== "__ALL__") {
    q = q.eq("user_id", userId);
  }
  if (requestId) {
    q = q.eq("request_id", requestId);
  }

  const { data } = await q;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((d: any) => ({
    id: d.id,
    requestId: d.request_id,
    timestamp: d.created_at,
    status: d.status,
    message: d.message,
    name: d.name,
    productId: d.product_id,
    itemKey: d.item_key,
    destUrl: d.dest_url,
    imageUrl: d.image_url,
    price: d.price,
    galleryCount: d.gallery_count,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
