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
  const { error } = await supabase.rpc("pgmq_set_vt", { q: queue, mid: msgId, vt: vtSeconds });
  if (error) throw error;
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
