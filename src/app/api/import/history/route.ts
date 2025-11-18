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
  const pageSize = 20;
  const supabase = (await import("@/lib/supabaseServer")).getSupabaseServer();
  let total = 0;
  if (supabase) {
    const { count } = await supabase
      .from("import_results")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    total = typeof count === "number" ? count : 0;
  }
  const maxPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), maxPages);
  const items = await listResults(userId, safePage, pageSize);
  return NextResponse.json({ success: true, items, total_records: total, current_page: safePage, max_pages: maxPages });
}

