import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";
import { getResultCounts } from "@/lib/history";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId") || "";
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = await getUserIdFromToken(token);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!requestId) return NextResponse.json({ error: "缺少requestId" }, { status: 400 });
  const counts = await getResultCounts(userId, requestId);
  return NextResponse.json({ success: true, counts });
}
