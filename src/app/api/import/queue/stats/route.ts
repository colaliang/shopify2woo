import { NextResponse } from "next/server";
import { pgmqQueueName, pgmqQsize, pgmqArchivedCount, pgmqRead, pgmqSetVt } from "@/lib/pgmq";
import { getResultCounts } from "@/lib/history";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const requestId = u.searchParams.get("requestId") || "";
  const sources = ["shopify", "wordpress", "wix"];
  const thresholds = {
    warn: parseInt(process.env.QUEUE_WARN_THRESHOLD || "1000", 10) || 1000,
  };
  const rows: Array<{ queue: string; ready: number | null; vt: number | null; total: number | null; archived: number | null }> = [];
  for (const s of sources) {
    for (const qn of [pgmqQueueName(`${s}_high`), pgmqQueueName(s)]) {
      const sz = await pgmqQsize(qn);
      const arch = await pgmqArchivedCount(qn);
      rows.push({ queue: qn, ready: sz?.ready ?? null, vt: sz?.vt ?? null, total: sz?.total ?? null, archived: arch ?? null });
    }
  }
  const warnQueues = rows.filter(r => (typeof r.total === 'number' && r.total! > thresholds.warn) || (typeof r.ready === 'number' && r.ready! > thresholds.warn));
  const warn = warnQueues.length > 0;
  const reasons = warnQueues.map(r => `队列积压: ${r.queue} total=${r.total} ready=${r.ready}`);
  let queueEmptyForRequest: boolean | undefined = undefined;
  let counts: { imported: number; errors: number; partial: number; processed: number; updated: number } | undefined = undefined;
  if (requestId) {
    queueEmptyForRequest = true;
    outer: for (const s of sources) {
      for (const qn of [pgmqQueueName(`${s}_high`), pgmqQueueName(s)]) {
        for (let i = 0; i < 3; i++) {
          const msgs = await pgmqRead(qn, 1, 100).catch(()=>[] as { msg_id: number; message: unknown }[]);
          if (!msgs.length) break;
          for (const row of msgs) {
            const msg = row && row.message;
            let rid = "";
            if (msg && typeof msg === 'object' && 'requestId' in msg) {
              const v = (msg as Record<string, unknown>).requestId;
              rid = typeof v === 'string' ? v : '';
            }
            await pgmqSetVt(qn, row.msg_id, 0).catch(()=>{});
            if (rid === requestId) { queueEmptyForRequest = false; break outer; }
          }
        }
      }
    }
    try {
      const c = await getResultCounts("__ALL__", requestId);
      // Count 'update' results separately? 'success' includes updates currently.
      // We might want to enhance getResultCounts to return 'update' specific counts if needed,
      // but for now 'imported' covers both additions and updates as per existing logic.
      // The user requested "Show how many updated".
      // This requires getResultCounts to return update count.
      counts = { imported: c.successCount, errors: c.errorCount, partial: c.partialCount, processed: c.processed, updated: c.updateCount };
    } catch {}
  }
  return NextResponse.json({ warn, reasons, rows, thresholds, queueEmptyForRequest, counts });
}
