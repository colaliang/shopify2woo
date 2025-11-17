import { getUserIdFromToken } from "@/lib/supabaseServer";

export const runtime = "edge";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestId = url.searchParams.get("requestId") || "";
    const token = url.searchParams.get("token") || "";
    if (!requestId) return new Response(JSON.stringify({ error: "缺少请求ID" }), { status: 400 });

    const tokenEnv = process.env.RUNNER_TOKEN || "";
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/, "");
    const allowAnon = process.env.RUNNER_ALLOW_ANON === "1";

    if (allowAnon) return new Response(JSON.stringify({ ok: true, reason: "anon" }), { status: 200 });
    if (tokenEnv && (token === tokenEnv || bearer === tokenEnv)) return new Response(JSON.stringify({ ok: true, reason: "runner_token" }), { status: 200 });

    const uid = await getUserIdFromToken(token || bearer);
    if (uid) return new Response(JSON.stringify({ ok: true, reason: "user" }), { status: 200 });

    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e || "未知错误");
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}