import { NextRequest } from "next/server";
import { GET as RootGET, POST as RootPOST } from "../route";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ source: string }> }) {
  const p = await ctx.params;
  const source = (p?.source || "").toLowerCase();
  const u = new URL(req.url);
  if (source) u.searchParams.set("source", source);
  const fwd = new Request(u.toString(), { method: req.method, headers: req.headers });
  return RootGET(fwd);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ source: string }> }) {
  const p = await ctx.params;
  const source = (p?.source || "").toLowerCase();
  const u = new URL(req.url);
  if (source) u.searchParams.set("source", source);
  const fwd = new Request(u.toString(), { method: req.method, headers: req.headers });
  return RootPOST(fwd);
}