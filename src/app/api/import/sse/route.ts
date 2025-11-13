import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";
import { getJob } from "@/lib/progress";
import { listLogs } from "@/lib/logs";
import { listResults } from "@/lib/history";

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
            const job = await getJob(userId, requestId);
            if (job) write("status", job);
            const logs = await listLogs(userId, requestId, 200);
            // send only new logs by timestamp
            const filtered = logs.filter((l: any) => {
              const ts = new Date(l.createdAt).getTime();
              return ts > lastLogStamp;
            });
            if (filtered.length) {
              lastLogStamp = new Date(filtered[filtered.length - 1].createdAt).getTime();
              write("logs", filtered);
            }
            const history = await listResults(userId, 1, 20);
            write("history", history);
            if (job && job.status === "done") {
              // keep open one more tick for client to receive
              clearInterval(timer);
              setTimeout(() => { try { controller.close(); } catch {} closed = true; }, 500);
            }
          } catch (e) {
            write("error", { message: e instanceof Error ? e.message : String(e) });
          }
        }, 1000);

        const abort = (e?: unknown) => {
          if (closed) return;
          clearInterval(timer);
          try { controller.close(); } catch {}
          closed = true;
        };
        // @ts-ignore - next provides signal via request
        const signal: AbortSignal | undefined = (req as any).signal;
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
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}