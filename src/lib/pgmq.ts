import { getSupabaseServer } from "./supabaseServer";

type PgmqMessage = { msg_id: number; vt: string; read_ct: number; enqueued_at: string; message: unknown };

export function pgmqQueueName(source: string) {
  const isHigh = source.endsWith("_high");
  const base = isHigh ? source.replace(/_high$/, "") : source;
  let mapped = base;
  if (base === "shopify") mapped = "import_shopify";
  else if (base === "wordpress") mapped = "import_wordpress";
  else if (base === "wix") mapped = "import_wix";
  return isHigh ? `${mapped}_high` : mapped;
}

export async function pgmqSendBatch(queue: string, messages: unknown[]) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { data, error } = await supabase.rpc("pgmq_send_batch_json", { q: queue, payloads: messages });
  if (error) {
    const ids: number[] = [];
    for (const msg of messages) {
      const one = await pgmqSendOne(queue, msg);
      ids.push(one);
    }
    return ids;
  }
  return data as number[];
}

export async function pgmqSendOne(queue: string, message: unknown) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { data, error } = await supabase.rpc("pgmq_send_one_json", { q: queue, payload: message });
  if (error) throw error;
  return Number(data);
}

export async function pgmqRead(queue: string, vtSeconds: number, limit: number) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { data, error } = await supabase.rpc("pgmq_read", { q: queue, vt: vtSeconds, lim: limit });
  if (error) throw error;
  return (data || []) as PgmqMessage[];
}

export async function pgmqDelete(queue: string, msgId: number) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { error } = await supabase.rpc("pgmq_delete", { q: queue, mid: msgId });
  if (error) throw error;
  return true;
}

export async function pgmqSetVt(queue: string, msgId: number, vtSeconds: number) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  
  // Fix for "function pgmq.set_vt(text, bigint, interval) does not exist" error.
  // The error "42883" indicates that Postgres cannot find a function matching the signature.
  // Supabase RPC might be trying to cast `vt` (number) to `interval` automatically if the function expects it,
  // OR the function expects `integer` but receives something else.
  
  // Attempt 1: Try 'vt' parameter name (most common).
  const { error } = await supabase.rpc("pgmq_set_vt", { q: queue, mid: msgId, vt: vtSeconds });
  
  if (error) {
     // If function signature mismatch (42883 or PGRST202), try 'vt_seconds'.
     // We don't throw immediately, we try the alternative.
     const { error: err2 } = await supabase.rpc("pgmq_set_vt", { q: queue, mid: msgId, vt_seconds: vtSeconds });
     if (err2) {
        // If both fail, throw the original error as it might be more relevant (or the second one).
        // But wait, if the first error was "function does not exist", maybe the second one is the key?
        // Let's throw the second error if it exists.
        throw err2;
     }
     return true;
  }
  
  return true;
}

export async function pgmqArchive(queue: string, msgId: number) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { error } = await supabase.rpc("pgmq_archive", { q: queue, mid: msgId });
  if (error) throw error;
  return true;
}

export async function pgmqQsize(queue: string): Promise<{ ready: number; vt: number; total: number } | null> {
  const supabase = getSupabaseServer();
  if (!supabase) return null;
  try {
    const { data } = await supabase.rpc("pgmq_qsize", { q: queue });
    if (!data) return null;
    const d = data as { ready: number; vt: number; total: number };
    return { ready: Number(d.ready || 0), vt: Number(d.vt || 0), total: Number(d.total || 0) };
  } catch {
    return null;
  }
}

export async function pgmqArchivedCount(queue: string): Promise<number | null> {
  const supabase = getSupabaseServer();
  if (!supabase) return null;
  try {
    const { data } = await supabase.rpc("pgmq_archived_count", { q: queue });
    return Number(data || 0);
  } catch {
    return null;
  }
}

export async function pgmqPurgeRequest(requestId: string, sources: string[] = ["shopify", "wordpress", "wix"]): Promise<number> {
  const supabase = getSupabaseServer();
  if (!supabase) return 0;
  let removed = 0;
  for (const s of sources) {
    for (const qn of [pgmqQueueName(`${s}_high`), pgmqQueueName(s)]) {
      for (let i = 0; i < 100; i++) {
        const rows = await pgmqRead(qn, 10, 100).catch(() => [] as { msg_id: number; message: unknown }[]);
        if (!rows.length) break;
        for (const row of rows) {
          const msg = row && row.message;
          let rid = "";
          if (msg && typeof msg === "object" && "requestId" in msg) {
            const v = (msg as Record<string, unknown>).requestId;
            rid = typeof v === "string" ? v : "";
          }
          if (rid === requestId) {
            await pgmqDelete(qn, row.msg_id).catch(() => {});
            removed++;
          } else {
            await pgmqSetVt(qn, row.msg_id, 0).catch(() => {});
          }
        }
        if (rows.length < 100) break;
      }
    }
  }
  return removed;
}
