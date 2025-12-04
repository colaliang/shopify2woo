import { NextResponse } from "next/server";
import { fetchHtmlMeta, buildWpPayloadFromHtml, extractProductPrices } from "@/lib/wordpressScrape";
import { buildWixPayload, buildWixVariationsFromHtml } from "@/lib/wixScrape";
import type { WooProductPayload } from "@/lib/importMap";
import { saveImportCache, sha256 } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const url = String(u.searchParams.get("url") || "");
    const platform = String(u.searchParams.get("platform") || "WordPress");
    if (!url) return NextResponse.json({ error: "missing_url" }, { status: 400 });

    const meta = await fetchHtmlMeta(url);
    const ct = meta.contentType || "";
    const finalUrl = meta.finalUrl || url;
    const isHtml = /text\/html/i.test(ct);
    if (!isHtml) {
      return NextResponse.json({ finalUrl, contentType: ct });
    }

    let p: WooProductPayload;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let built: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawPrices: any = [];

    if (platform === "Wix") {
      const wixBuilt = buildWixPayload(finalUrl, meta.html);
      const vars = buildWixVariationsFromHtml(meta.html);
      
      // Cache for runner
      try {
         const cacheObj = { ...wixBuilt, _variations: vars };
         await saveImportCache(url, sha256(meta.html), cacheObj);
      } catch {}

      p = wixBuilt.payload as WooProductPayload;
      // Adapter for Wix debug view
      built = {
        catNames: wixBuilt.categories,
        imagesAbs: p.images || [],
        short_description: "",
        variations: vars.variations || [],
      };
    } else {
      // Default to WordPress
      built = buildWpPayloadFromHtml(meta.html, meta.originalUrl, meta.finalUrl);
      
      // Cache for runner
      try {
         await saveImportCache(url, sha256(meta.html), built);
      } catch {}

      rawPrices = extractProductPrices(meta.html);
      p = built.payload as WooProductPayload;
    }

    const name = String(p?.name || "");
    const skuRaw = String(p?.sku || "");
    const skuNormalized = String(p?.sku || "");
    const description = String(p?.description || "");
    const short_description = String(built.short_description || "");
    const regular_price = String(p?.regular_price || "");
    const sale_price = String(p?.sale_price || "");
    const variations = built.variations || [];
    const attributes = p?.attributes || [];
    const filteredCategories = (built.catNames || []) as string[];
    const primaryCategory = filteredCategories[0] || "";
    const galleryCount = (built.imagesAbs || []).length;
    const selectedCount = Array.isArray(p?.images) ? p.images.length : 0;

    return NextResponse.json({ 
      finalUrl, 
      contentType: ct, 
      name, 
      skuRaw, 
      skuNormalized, 
      description, 
      short_description,
      regular_price,
      sale_price,
      primaryCategory, 
      filteredCategories, 
      galleryCount, 
      selectedCount, 
      urlMismatch: meta.urlMismatch, 
      originalUrl: meta.originalUrl,
      attributes,
      variations,
      rawPrices,
      payload: p
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
