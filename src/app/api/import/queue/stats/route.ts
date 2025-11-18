import { NextResponse } from "next/server";
import { pgmqQueueName, pgmqQsize, pgmqArchivedCount } from "@/lib/pgmq";

export const runtime = "nodejs";

export async function GET() {
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
  return NextResponse.json({ warn, reasons, rows, thresholds });
}