import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "不支持" }, { status: 404 });
}
