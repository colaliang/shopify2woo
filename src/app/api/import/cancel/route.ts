import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";
import { appendLog } from "@/lib/logs";
import { pgmqPurgeRequest } from "@/lib/pgmq";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { requestId } = await req.json();
    if (!requestId) return NextResponse.json({ error: "缺少请求ID" }, { status: 400 });
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = await getUserIdFromToken(token);
    const disableAuth = process.env.NEXT_PUBLIC_DISABLE_AUTH === "1" || process.env.DISABLE_AUTH === "1";
    const uid = (!userId && disableAuth) ? "__LOCAL__" : (userId || "");
    if (!userId && !disableAuth) return NextResponse.json({ error: "未登录" }, { status: 401 });
    await appendLog(uid, requestId, "info", "任务已停止（用户取消）");
    let removed = 0;
    if (process.env.USE_PGMQ === "1") {
      removed = await pgmqPurgeRequest(requestId);
    }
    return NextResponse.json({ ok: true, removed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
