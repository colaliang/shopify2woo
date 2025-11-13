import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";
import { listLogs } from "@/lib/logs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId") || "";
  const limitStr = url.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitStr || "1000", 10) || 1000, 1), 5000);
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = await getUserIdFromToken(token);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!requestId) return NextResponse.json({ error: "缺少请求ID" }, { status: 400 });
  const items = await listLogs(userId, requestId, limit);
  return NextResponse.json({ success: true, items });
}
