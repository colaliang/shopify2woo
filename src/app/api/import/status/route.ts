import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";
import { getResultCounts } from "@/lib/history";
import { pgmqQueueName, pgmqRead, pgmqSetVt } from "@/lib/pgmq";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId") || "";
  const auth = req.headers.get("authorization") || "";
  const tokenHeader = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const tokenQuery = url.searchParams.get("token") || "";
  const runnerToken = process.env.RUNNER_TOKEN || "";
  const runnerAllowAnon = process.env.RUNNER_ALLOW_ANON === "1";
  const token = tokenHeader || tokenQuery;
  const userId = await getUserIdFromToken(token);
  const disableAuth = process.env.NEXT_PUBLIC_DISABLE_AUTH === "1" || process.env.DISABLE_AUTH === "1";
  const tokenOk = (!!runnerToken && token === runnerToken) || runnerAllowAnon;
  const listKey = (!userId && (disableAuth || tokenOk)) ? "__ALL__" : (userId || "");
  if (!userId && !(disableAuth || tokenOk)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!requestId) return NextResponse.json({ error: "缺少requestId" }, { status: 400 });
  const counts = await getResultCounts(listKey || userId as string, requestId);
  let queueEmpty = true;
  if (process.env.USE_PGMQ === "1") {
    const sources = ["shopify", "wordpress", "wix"];
    outer: for (const s of sources) {
      for (const qn of [pgmqQueueName(`${s}_high`), pgmqQueueName(s)]) {
        for (let i = 0; i < 5; i++) {
          const rows = await pgmqRead(qn, 1, 100).catch(() => [] as { msg_id: number; message: unknown }[]);
          if (!rows || rows.length === 0) break;
          for (const row of rows) {
            const msg = row && row.message;
            let rid = "";
            if (msg && typeof msg === "object" && "requestId" in msg) {
              const v = (msg as Record<string, unknown>).requestId;
              rid = typeof v === "string" ? v : "";
            }
            await pgmqSetVt(qn, row.msg_id, 0).catch(() => {});
            if (rid === requestId) { queueEmpty = false; break outer; }
          }
        }
      }
    }
  }
  return NextResponse.json({ success: true, counts, queueEmpty });
}
