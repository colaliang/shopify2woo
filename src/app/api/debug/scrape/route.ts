import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const url = String(u.searchParams.get("url") || "");
    if (!url) return NextResponse.json({ error: "missing_url" }, { status: 400 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "Mozilla/5.0" } });
    clearTimeout(timer);
    const ct = res.headers.get("content-type") || "";
    const finalUrl = res.url || url;
    const isHtml = /text\/html/i.test(ct);
    const text = await res.text();
    let name = "";
    let skuRaw = "";
    let skuNormalized = "";
    let primaryCategory = "";
    let filteredCategories: string[] = [];
    let galleryCount = 0;
    let selectedCount = 0;
    if (isHtml) {
      const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      name = titleMatch ? String(titleMatch[1]).trim() : "";
      const skuMatch = text.match(/SKU\s*[:：]\s*([A-Za-z0-9_-]+)/i) || text.match(/itemprop=\"sku\"[^>]*content=\"([^\"]+)/i);
      skuRaw = skuMatch ? String(skuMatch[1]) : "";
      skuNormalized = skuRaw.replace(/\s+/g, "").toUpperCase();
      const catMatches = Array.from(text.matchAll(/breadcrumbs|category|分类|面包屑/gi)).length;
      primaryCategory = catMatches ? "unknown" : "";
      filteredCategories = [];
      galleryCount = (text.match(/<img\b[^>]*src=/gi) || []).length;
      selectedCount = 0;
    }
    return NextResponse.json({ finalUrl, contentType: ct, name, skuRaw, skuNormalized, primaryCategory, filteredCategories, galleryCount, selectedCount });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}