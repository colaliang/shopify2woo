import { NextResponse } from "next/server";
import { fetchHtmlMeta, buildWpPayloadFromHtml } from "@/lib/wordpressScrape";
import type { WooProductPayload } from "@/lib/importMap";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const url = String(u.searchParams.get("url") || "");
    if (!url) return NextResponse.json({ error: "missing_url" }, { status: 400 });

    const meta = await fetchHtmlMeta(url);
    const ct = meta.contentType || "";
    const finalUrl = meta.finalUrl || url;
    const isHtml = /text\/html/i.test(ct);
    if (!isHtml) {
      return NextResponse.json({ finalUrl, contentType: ct });
    }

    const built = buildWpPayloadFromHtml(meta.html, meta.originalUrl, meta.finalUrl);
    const p = built.payload as WooProductPayload;
    const name = String(p?.name || "");
    const skuRaw = String(p?.sku || "");
    const skuNormalized = String(p?.sku || "");
    const filteredCategories = (built.catNames || []) as string[];
    const primaryCategory = filteredCategories[0] || "";
    const galleryCount = (built.imagesAbs || []).length;
    const selectedCount = Array.isArray(p?.images) ? p.images.length : 0;

    return NextResponse.json({ finalUrl, contentType: ct, name, skuRaw, skuNormalized, primaryCategory, filteredCategories, galleryCount, selectedCount, urlMismatch: meta.urlMismatch, originalUrl: meta.originalUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
