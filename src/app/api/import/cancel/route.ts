import { NextResponse } from "next/server";
import { getSupabaseServer, getUserIdFromToken } from "@/lib/supabaseServer";
import { appendLog } from "@/lib/logs";
import { pgmqQueueName, pgmqRead, pgmqDelete, pgmqSetVt } from "@/lib/pgmq";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { requestId } = await req.json();
    if (!requestId) return NextResponse.json({ error: "缺少请求ID" }, { status: 400 });
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = await getUserIdFromToken(token);
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
    await appendLog(userId, requestId, "info", "canceled by user");
    let removed = 0;
    const supabase = getSupabaseServer();
    if (process.env.USE_PGMQ === "1" && supabase) {
      const { data: jobRow } = await supabase
        .from("import_jobs")
        .select("source")
        .eq("request_id", requestId)
        .limit(1)
        .maybeSingle();
      const source = jobRow?.source || "";
      if (source) {
        const queue = pgmqQueueName(source);
        for (let i = 0; i < 50; i++) {
          const rows = await pgmqRead(queue, 10, 100).catch(() => [] as any);
          if (!rows || rows.length === 0) break;
          for (const row of rows) {
            const msg = row && (row as any).message;
            let rid = "";
            if (msg && typeof msg === "object" && "requestId" in msg) {
              const v = (msg as Record<string, unknown>).requestId;
              rid = typeof v === "string" ? v : "";
            }
            if (rid === requestId) {
              await pgmqDelete(queue, (row as any).msg_id).catch(() => {});
              removed++;
            } else {
              await pgmqSetVt(queue, (row as any).msg_id, 0).catch(() => {});
            }
          }
          if (rows.length < 100) break;
        }
        try {
          // 触发一次 runner 清扫，使处于不可见窗口的消息尽快被读取并因 canceled 状态被删除
          const origin = process.env.NEXT_PUBLIC_APP_URL || "";
          const url = origin ? `${origin}/api/import/runner?source=${encodeURIComponent(source)}` : `/api/import/runner?source=${encodeURIComponent(source)}`;
          await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(()=>{});
        } catch {}
      }
    }
    return NextResponse.json({ ok: true, removed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
