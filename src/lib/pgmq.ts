import { getSupabaseServer } from "./supabaseServer";

type PgmqMessage = { msg_id: number; vt: string; read_ct: number; enqueued_at: string; message: any };

export function pgmqQueueName(source: string) {
  if (source === "shopify") return "import_shopify";
  if (source === "wordpress") return "import_wordpress";
  if (source === "wix") return "import_wix";
  return source;
}

export async function pgmqSendBatch(queue: string, messages: any[]) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { data, error } = await (supabase as any).rpc("pgmq_send_batch_json", { q: queue, payloads: messages });
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

export async function pgmqSendOne(queue: string, message: any) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { data, error } = await (supabase as any).rpc("pgmq_send_one_json", { q: queue, payload: message });
  if (error) throw error;
  return Number(data);
}

export async function pgmqRead(queue: string, vtSeconds: number, limit: number) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { data, error } = await (supabase as any).rpc("pgmq_read", { q: queue, vt: vtSeconds, lim: limit });
  if (error) throw error;
  return (data || []) as PgmqMessage[];
}

export async function pgmqDelete(queue: string, msgId: number) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { error } = await (supabase as any).rpc("pgmq_delete", { q: queue, mid: msgId });
  if (error) throw error;
  return true;
}

export async function pgmqSetVt(queue: string, msgId: number, vtSeconds: number) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { error } = await (supabase as any).rpc("pgmq_set_vt", { q: queue, mid: msgId, vt: vtSeconds });
  if (error) throw error;
  return true;
}

export async function pgmqArchive(queue: string, msgId: number) {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("no supabase");
  const { error } = await (supabase as any).rpc("pgmq_archive", { q: queue, mid: msgId });
  if (error) throw error;
  return true;
}
