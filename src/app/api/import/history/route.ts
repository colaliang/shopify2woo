import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";
import { listResults } from "@/lib/history";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pageStr = url.searchParams.get("page") || "1";
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = await getUserIdFromToken(token);
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const items = await listResults(userId, page, 20);
  return NextResponse.json({ success: true, items });
}

