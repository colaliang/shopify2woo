import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { pgmqQueueName, pgmqQsize, pgmqArchivedCount } from "@/lib/pgmq";
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
    // Simplified check: if ALL queues are empty, then it is definitely empty for this request.
    // This avoids the destructive "read to peek" scanning which can hide messages from the runner.
    const allQueuesEmpty = rows.every(r => (r.total || 0) === 0 && (r.ready || 0) === 0 && (r.vt || 0) === 0);
    if (allQueuesEmpty) {
      queueEmptyForRequest = true;
    } else {
      // If queues are not empty, we don't know if they are for this request or others.
      // But we shouldn't scan (read & hide) as it causes race conditions.
      // We leave queueEmptyForRequest as undefined, forcing the frontend to rely on processed vs expected counts.
      
      // Optional: If we really wanted to know, we'd need a non-destructive PGMQ peek, or a separate lookup table.
    }

    /* 
    // Dangerous scanning logic removed:
    queueEmptyForRequest = true;
    outer: for (const s of sources) {
      // ... (scanning logic that hides messages)
    }
    */

    // Use database counts for accurate reporting
    try {
      const c = await getResultCounts("__ALL__", requestId);
      counts = { imported: c.successCount, errors: c.errorCount, partial: c.partialCount, processed: c.processed, updated: c.updateCount };
    } catch {}

    // LOGIC FIX: 
    // queueEmptyForRequest used to be derived from PGMQ status. But PGMQ hides messages when they are being processed (invisible).
    // So "queue empty" might just mean "all messages are being processed right now".
    // If we rely on queue empty to mark "completed", we might finish prematurely while tasks are still running.
    //
    // Instead, we should rely on: (success + error) >= total_expected
    // But we don't always know total_expected easily here without querying the request log or passing it.
    //
    // However, if we DO use queue stats, we must be careful.
    // If PGMQ says total=0, ready=0, vt=0, it means NO messages at all.
    // But if we have multiple users, PGMQ stats are global for the queue.
    // So we can't rely on global PGMQ stats for a specific user request unless we filter, which we can't easily do without peeking.
    //
    // Current approach:
    // 1. Return accurate counts from DB (imported, errors).
    // 2. Frontend knows "fetched" (total expected).
    // 3. Frontend decides when to stop: when imported + errors >= fetched.
    // 4. Backend "queueEmptyForRequest" is only a hint.
    
    // We will keep queueEmptyForRequest as a hint for "global queue is empty", but frontend should prioritize counts.


    // Double check with logs: if there is a log entry in the last 60 seconds, assume it is still running (messages are invisible)
    if (queueEmptyForRequest) {
       try {
         const supabase = getSupabaseServer();
         if (supabase) {
            const { data: logs } = await supabase
                .from("import_logs")
                .select("created_at")
                .eq("request_id", requestId)
                .order("created_at", { ascending: false })
                .limit(1);
            if (logs && logs.length > 0) {
                const last = new Date(logs[0].created_at).getTime();
                const now = Date.now();
                // If log is very recent, it means runner is active, so queue is likely not effectively empty (just invisible)
                if (now - last < 60000) { 
                    queueEmptyForRequest = false;
                }
            }
         }
       } catch {}
    }
  }
  return NextResponse.json({ warn, reasons, rows, thresholds, queueEmptyForRequest, counts });
}