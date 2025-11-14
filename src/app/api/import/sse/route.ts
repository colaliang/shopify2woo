import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";
import { listLogs } from "@/lib/logs";
import { listResults, getResultCounts } from "@/lib/history";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestId = searchParams.get("requestId") || "";
    const token = searchParams.get("token") || "";
    if (!requestId) return NextResponse.json({ error: "缺少请求ID" }, { status: 400 });
    const userId = await getUserIdFromToken(token);
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        let closed = false;
        let lastLogStamp = 0;
        const write = (event: string, data: unknown) => {
          if (closed) return;
          const line = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(enc.encode(line));
        };

        const timer = setInterval(async () => {
          try {
            // import-jobs 相关逻辑已移除，不再推送 status
            const logs = await listLogs(userId, requestId, 200);
            // send only new logs by timestamp
            const filtered = logs.filter((l: { createdAt: string }) => {
              const ts = new Date(l.createdAt).getTime();
              return ts > lastLogStamp;
            });
            if (filtered.length) {
              lastLogStamp = new Date(filtered[filtered.length - 1].createdAt).getTime();
              write("logs", filtered);
            }
            const history = await listResults(userId, 1, 20);
            write("history", history);
            const counts = await getResultCounts(userId, requestId);
            write("counts", { requestId, ...counts });
          } catch (e) {
            write("error", { message: e instanceof Error ? e.message : String(e) });
          }
        }, 1000);

        const abort = () => {
          if (closed) return;
          clearInterval(timer);
          try { controller.close(); } catch {}
          closed = true;
        };
        const signal: AbortSignal | undefined = (req as unknown as { signal?: AbortSignal }).signal;
        signal?.addEventListener("abort", abort);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
