import { listLogs } from "@/lib/logs";
import { listResults, getResultCounts } from "@/lib/history";
import { getUserIdFromToken } from "@/lib/supabaseServer";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function authorize(req: Request) {
  if (process.env.RUNNER_ALLOW_ANON === "1") return true;
  const tokenEnv = process.env.RUNNER_TOKEN || "";
  const url = new URL(req.url);
  const qpToken = url.searchParams.get("token") || "";
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (tokenEnv && (qpToken === tokenEnv || bearer === tokenEnv)) return true;
  if (bearer) {
    const uid = await getUserIdFromToken(bearer);
    if (uid) return true;
  }
  if (qpToken) {
    const uid = await getUserIdFromToken(qpToken);
    if (uid) return true;
  }
  return false;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get("requestId") || "";
  const token = searchParams.get("token") || "";
  if (!requestId) return new Response(JSON.stringify({ error: "缺少请求ID" }), { status: 400 });
  if (!(await authorize(req))) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  let userId = await getUserIdFromToken(token);
  if (!userId) {
    userId = "system";
  }

  // @ts-ignore
  const pair = new WebSocketPair();
  // @ts-ignore
  const client = pair[0];
  // @ts-ignore
  const server = pair[1];
  // @ts-ignore
  server.accept();

  let closed = false;
  let lastLogStamp = 0;
  const baseInterval = parseInt(process.env.SSE_POLL_INTERVAL_MS || "5000", 10) || 5000;
  const maxInterval = parseInt(process.env.SSE_MAX_POLL_INTERVAL_MS || "30000", 10) || 30000;
  const maxWall = parseInt(process.env.SSE_MAX_WALLTIME_MS || "600000", 10) || 600000;
  const started = Date.now();
  let intervalMs = baseInterval;

  const send = (event: string, data: unknown) => {
    if (closed) return;
    try { server.send(JSON.stringify({ event, data })); } catch {}
  };

  const loop = async () => {
    if (closed) return;
    if (Date.now() - started > maxWall) { try { server.close(1000, "max_walltime"); } catch {} closed = true; return; }
    try {
      const logs = await listLogs(userId, requestId, 200);
      const filtered = logs.filter((l: { createdAt: string }) => {
        const ts = new Date(l.createdAt).getTime();
        return ts > lastLogStamp;
      });
      if (filtered.length) {
        lastLogStamp = new Date(filtered[filtered.length - 1].createdAt).getTime();
        send("logs", filtered);
        intervalMs = baseInterval;
      } else {
        intervalMs = Math.min(maxInterval, Math.max(baseInterval, Math.floor(intervalMs * 1.5)));
      }
      const history = await listResults(userId, 1, 20);
      send("history", history);
      const counts = await getResultCounts(userId, requestId);
      send("counts", { requestId, ...counts });
      send("ping", { ts: Date.now() });
    } catch (e) {
      send("error", { message: e instanceof Error ? e.message : String(e) });
      intervalMs = Math.min(maxInterval, Math.max(baseInterval, Math.floor(intervalMs * 1.5)));
    } finally {
      if (!closed) setTimeout(loop, intervalMs);
    }
  };

  // @ts-ignore
  server.addEventListener("message", (evt: MessageEvent) => {
    try {
      const msg = JSON.parse(String(evt.data || "{}"));
      if (msg && msg.type === "close") { try { server.close(); } catch {} closed = true; }
    } catch {}
  });

  // @ts-ignore
  server.addEventListener("close", () => { closed = true; });

  setTimeout(loop, intervalMs);
  // @ts-ignore
  return new Response(null, { status: 101, webSocket: client });
}