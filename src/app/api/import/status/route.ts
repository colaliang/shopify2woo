import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";
import { getJob } from "@/lib/progress";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId") || "";
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = await getUserIdFromToken(token);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!requestId) return NextResponse.json({ error: "缺少请求ID" }, { status: 400 });
  const job = await getJob(userId, requestId);
  if (!job) return NextResponse.json({ error: "未找到" }, { status: 404 });
  return NextResponse.json({ success: true, job });
}

