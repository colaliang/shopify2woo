import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  return NextResponse.json({ error: "不支持" }, { status: 404 });
}
