import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";
import { listResults, countResults } from "@/lib/history";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pageStr = url.searchParams.get("page") || "1";
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const auth = req.headers.get("authorization") || "";
  const tokenHeader = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const tokenQuery = url.searchParams.get("token") || "";
  const runnerToken = process.env.RUNNER_TOKEN || "";
  const runnerAllowAnon = process.env.RUNNER_ALLOW_ANON === "1";
  const token = tokenHeader || tokenQuery;
  const userId = await getUserIdFromToken(token);
  const disableAuth = process.env.NEXT_PUBLIC_DISABLE_AUTH === "1" || process.env.DISABLE_AUTH === "1";
  const tokenOk = (!!runnerToken && token === runnerToken) || runnerAllowAnon;
  const preferredUser = (!userId && (disableAuth || tokenOk)) ? "__ALL__" : (userId || "__ALL__");
  if (!userId && !(disableAuth || tokenOk)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const pageSize = 20;
  let listUser = preferredUser;
  let total = await countResults(listUser);
  if (disableAuth && total === 0) {
    const totalAll = await countResults("__ALL__");
    if (totalAll > 0) {
      listUser = "__ALL__";
      total = totalAll;
    }
  }
  const maxPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), maxPages);
  const items = await listResults(listUser, safePage, pageSize);
  return NextResponse.json({ success: true, items, total_records: total, current_page: safePage, max_pages: maxPages });
}

