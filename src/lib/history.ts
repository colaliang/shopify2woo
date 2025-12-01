import { getSupabaseServer } from "./supabaseServer";
import { appendLog } from "./logs";

type Result = {
  requestId: string;
  userId: string;
  source: string;
  itemKey: string;
  name?: string;
  productId?: number;
  status: "success" | "error" | "partial";
  action?: "add" | "update" | "skipped_duplicate";
  createdAt: string;
};

type DbResultRow = {
  request_id: string;
  source: string;
  item_key: string;
  name?: string;
  product_id?: number;
  status?: "success" | "error" | "partial";
  action?: string;
  created_at: string;
};

const globalObj = globalThis as unknown as { __importResults?: Result[] };
function readLocal(): Result[] {
  try { return Array.isArray(globalObj.__importResults) ? globalObj.__importResults as Result[] : []; } catch { return []; }
}
function writeLocal(arr: Result[]) {
  try { (globalThis as unknown as { __importResults?: Result[] }).__importResults = arr; } catch {}
}

export async function recordResult(userId: string, source: string, requestId: string, itemKey: string, name: string | undefined, productId: number | undefined, status: "success" | "error" | "partial", errorMessage?: string, action?: "add" | "update" | "skipped_duplicate") {
  const supabase = getSupabaseServer();
  const now = new Date().toISOString();
  if (supabase) {
    const disableAuth = process.env.NEXT_PUBLIC_DISABLE_AUTH === "1" || process.env.DISABLE_AUTH === "1";
    const uid = (userId && userId.trim()) || (disableAuth ? "__LOCAL__" : "");
    if (!uid) {
      const arr = readLocal();
      const idx = arr.findIndex((r) => r.userId === userId && r.requestId === requestId && r.source === source && r.itemKey === itemKey);
      if (idx >= 0) arr[idx] = { ...arr[idx], name, productId, status, action, createdAt: now };
      else arr.push({ userId, requestId, source, itemKey, name, productId, status, action, createdAt: now });
      writeLocal(arr);
      if (status === "error") {
        const msg = errorMessage || "unknown_error";
        try { await appendLog(userId, requestId, "error", `result error source=${source} item=${itemKey} msg=${msg}`); } catch {}
      }
      return;
    }
    try {
      const { data: existing, error: selErr } = await supabase
        .from("import_results")
        .select("id, status, name, product_id, action")
        .eq("user_id", uid)
        .eq("request_id", requestId)
        .eq("source", source)
        .eq("item_key", itemKey)
        .limit(1)
        .maybeSingle();
      if (selErr) throw selErr;
      if (existing && typeof existing?.id === "number") {
        const { error: upErr } = await supabase
          .from("import_results")
          .update({ name, product_id: productId, status, action, error_message: status === "success" ? null : (errorMessage || null) })
          .eq("id", existing.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from("import_results").insert({ user_id: uid, request_id: requestId, source, item_key: itemKey, name, product_id: productId, status, action, error_message: status === "success" ? null : (errorMessage || null) });
        if (insErr) throw insErr;
      }
      try { await appendLog(userId, requestId, "info", `result_write_ok source=${source} item=${itemKey} status=${status}`); } catch {}
    } catch (e) {
      const emsg = e instanceof Error ? e.message : String(e || "unknown");
      try { await appendLog(userId, requestId, "error", `result_write_failed source=${source} item=${itemKey} err=${emsg}`); } catch {}
      try {
        const { data: existing, error: selErr2 } = await supabase
          .from("import_results")
          .select("id")
          .eq("user_id", uid)
          .eq("request_id", requestId)
          .eq("source", source)
          .eq("item_key", itemKey)
          .limit(1)
          .maybeSingle();
        if (selErr2) throw selErr2;
        if (existing && typeof existing?.id === "number") {
          const { error: upErr2 } = await supabase
            .from("import_results")
            .update({ name, product_id: productId, status })
            .eq("id", existing.id);
          if (upErr2) throw upErr2;
        } else {
          const { error: insErr2 } = await supabase.from("import_results").insert({ user_id: uid, request_id: requestId, source, item_key: itemKey, name, product_id: productId, status });
          if (insErr2) throw insErr2;
        }
        try { await appendLog(userId, requestId, "info", `result_write_ok_fallback source=${source} item=${itemKey} status=${status}`); } catch {}
      } catch {}
    }
    if (status === "error") {
      const msg = errorMessage || "unknown_error";
      await appendLog(userId, requestId, "error", `result error source=${source} item=${itemKey} msg=${msg}`);
    }
    return;
  }
  const arr = readLocal();
  const idx = arr.findIndex((r) => r.userId === userId && r.requestId === requestId && r.source === source && r.itemKey === itemKey);
  if (idx >= 0) arr[idx] = { ...arr[idx], name, productId, status, action, createdAt: now };
  else arr.push({ userId, requestId, source, itemKey, name, productId, status, action, createdAt: now });
  writeLocal(arr);
  if (status === "error") {
    const msg = errorMessage || "unknown_error";
    try { await appendLog(userId, requestId, "error", `result error source=${source} item=${itemKey} msg=${msg}`); } catch {}
  }
}

export async function listResults(userId: string, page = 1, pageSize = 20, requestId?: string) {
  const supabase = getSupabaseServer();
  if (supabase) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let q = supabase
      .from("import_results")
      .select("request_id, source, item_key, name, product_id, status, action, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);
    
    if (requestId) {
      q = q.eq("request_id", requestId);
    }
    
    const { data } = userId === "__ALL__" ? await q : await q.eq("user_id", userId);
    return (data || []).map((d: DbResultRow) => ({ requestId: d.request_id, source: d.source, itemKey: d.item_key, name: d.name, productId: d.product_id, status: d.status, action: d.action as ("add"|"update"|"skipped_duplicate"|undefined), createdAt: d.created_at }));
  }
  const arr = (userId === "__ALL__" ? readLocal() : readLocal().filter((r) => r.userId === userId))
    .filter(r => !requestId || r.requestId === requestId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const from = (page - 1) * pageSize;
  return arr.slice(from, from + pageSize);
}

export async function getResultCounts(userId: string, requestId: string) {
  const supabase = getSupabaseServer();
  if (supabase) {
    try {
      const qBase = supabase.from("import_results").select("*", { count: "exact", head: true }).eq("request_id", requestId);
      const { count: succ } = userId === "__ALL__" ? await qBase.eq("status", "success") : await qBase.eq("user_id", userId).eq("status", "success");
      const qBase2 = supabase.from("import_results").select("*", { count: "exact", head: true }).eq("request_id", requestId);
      const { count: err } = userId === "__ALL__" ? await qBase2.eq("status", "error") : await qBase2.eq("user_id", userId).eq("status", "error");
      const qBase3 = supabase.from("import_results").select("*", { count: "exact", head: true }).eq("request_id", requestId);
      const { count: part } = userId === "__ALL__" ? await qBase3.eq("status", "partial") : await qBase3.eq("user_id", userId).eq("status", "partial");
      
      // Count updates separately
      const qBase4 = supabase.from("import_results").select("*", { count: "exact", head: true }).eq("request_id", requestId).eq("action", "update");
      const { count: upd } = userId === "__ALL__" ? await qBase4.eq("status", "success") : await qBase4.eq("user_id", userId).eq("status", "success");

      const successCount = typeof succ === "number" ? succ : 0;
      const errorCount = typeof err === "number" ? err : 0;
      const partialCount = typeof part === "number" ? part : 0;
      const updateCount = typeof upd === "number" ? upd : 0;

      // Merge with local cache to handle cases where supabase exists but writes fell back to local
      const localArr = readLocal().filter((r) => (userId === "__ALL__" ? r.requestId === requestId : (r.userId === userId && r.requestId === requestId)));
      const ls = localArr.filter((r) => r.status === "success").length;
      const le = localArr.filter((r) => r.status === "error").length;
      const lp = localArr.filter((r) => r.status === "partial").length;
      const lu = localArr.filter((r) => r.status === "success" && r.action === "update").length;

      const mergedSuccess = successCount + ls;
      const mergedError = errorCount + le;
      const mergedPartial = partialCount + lp;
      const mergedUpdate = updateCount + lu;
      
      return { successCount: mergedSuccess, errorCount: mergedError, partialCount: mergedPartial, updateCount: mergedUpdate, processed: mergedSuccess + mergedError + mergedPartial };
    } catch {}
  }
  const arr = readLocal().filter((r) => (userId === "__ALL__" ? r.requestId === requestId : (r.userId === userId && r.requestId === requestId)));
  const successCount = arr.filter((r) => r.status === "success").length;
  const errorCount = arr.filter((r) => r.status === "error").length;
  const partialCount = arr.filter((r) => r.status === "partial").length;
  const updateCount = arr.filter((r) => r.status === "success" && r.action === "update").length;
  return { successCount, errorCount, partialCount, updateCount, processed: successCount + errorCount + partialCount };
}

export async function countResults(userId: string, requestId?: string) {
  const supabase = getSupabaseServer();
  if (supabase) {
    let q = supabase
      .from("import_results")
      .select("*", { count: "exact", head: true });
    
    if (requestId) {
      q = q.eq("request_id", requestId);
    }

    const { count } = userId === "__ALL__" ? await q : await q.eq("user_id", userId);
    return typeof count === "number" ? count : 0;
  }
  const arr = readLocal();
  return (userId === "__ALL__" ? arr : arr.filter((r) => r.userId === userId))
    .filter(r => !requestId || r.requestId === requestId).length;
}
