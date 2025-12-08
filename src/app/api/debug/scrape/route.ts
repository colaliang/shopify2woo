import { NextResponse } from "next/server";
import { fetchHtmlMeta, buildWpPayloadFromHtml, extractProductPrices } from "@/lib/wordpressScrape";
import { buildWixPayload, buildWixVariationsFromHtml } from "@/lib/wixScrape";
import { fetchProductByHandle } from "@/lib/shopify";
import type { WooProductPayload } from "@/lib/importMap";
import { saveImportCache, sha256 } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getShopifyHandle(url: string) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/products\/([^\/?#]+)/);
    if (m) return m[1];
  } catch {}
  return "";
}

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

    if (platform === "Shopify") {
      const handle = getShopifyHandle(finalUrl);
      if (!handle) throw new Error("无法从 URL 提取 Shopify Handle");
      const shopifyBase = new URL(finalUrl).origin;
      const product = await fetchProductByHandle(shopifyBase, handle);
      if (!product) throw new Error("无法通过 Shopify API 获取产品数据");

      // Map ShopifyProduct to debug format
      const images = (product.images || []).map(img => img.src);
      const variants = (product.variants || []).map(v => ({
        id: String(v.id),
        price: v.price,
        sku: v.sku,
        attributes: [
          v.option1 && { name: product.options?.[0]?.name || "Option1", value: v.option1 },
          v.option2 && { name: product.options?.[1]?.name || "Option2", value: v.option2 },
          v.option3 && { name: product.options?.[2]?.name || "Option3", value: v.option3 },
        ].filter(Boolean)
      }));

      p = {
        name: product.title,
        description: product.body_html || "",
        short_description: "", // Shopify usually doesn't have explicit short desc in API
        regular_price: product.variants?.[0]?.price,
        images: images.map(src => ({ src })),
        sku: product.variants?.[0]?.sku,
        categories: product.product_type ? [{ name: product.product_type }] : [],
      } as WooProductPayload;

      built = {
        catNames: product.product_type ? [product.product_type] : [],
        imagesAbs: images,
        short_description: "",
        variations: variants,
      };
      
      // Cache for runner (though Shopify runner usually fetches again or uses passed data)
       try {
         await saveImportCache(url, sha256(JSON.stringify(product)), built);
      } catch {}

    } else if (platform === "Wix") {
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
