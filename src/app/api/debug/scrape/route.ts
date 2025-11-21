import { NextResponse } from "next/server";
import { fetchHtmlMeta, buildWpPayloadFromHtml, buildWpVariationsFromHtml } from "@/lib/wordpressScrape";
import { buildWixVariationsFromHtml } from "@/lib/wixScrape";

 

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const src = u.searchParams.get("url") || "";
    const source = (u.searchParams.get("source") || "wordpress").toLowerCase();
    if (!src) return NextResponse.json({ error: "缺少url" }, { status: 400 });
    const meta = await fetchHtmlMeta(src);
    const html = meta.html;
    if (source === "wix") {
      const variationsPreview = buildWixVariationsFromHtml(html);
      const result = buildWpPayloadFromHtml(html, src, meta.finalUrl || src);
      return NextResponse.json({ ...result, variationsPreview });
    } else {
      const variationsPreview = buildWpVariationsFromHtml(html);
      const result = buildWpPayloadFromHtml(html, src, meta.finalUrl || src);
      return NextResponse.json({ ...result, variationsPreview });
    }
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e || "unknown") }, { status: 500 });
  }
}