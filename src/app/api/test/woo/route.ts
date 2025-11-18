import { NextResponse } from "next/server";
import { wooGet, wooPost, wooPut, type WooConfig } from "@/lib/woo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url = String(body?.url || "");
    const consumerKey = String(body?.consumerKey || "");
    const consumerSecret = String(body?.consumerSecret || "");
    const authMode = String(body?.authMode || "query").toLowerCase();
    const action = String(body?.action || "");
    const payload = body?.payload || {};
    if (!url || !consumerKey || !consumerSecret || !action) {
      return NextResponse.json({ error: "missing_params" }, { status: 400 });
    }
    const cfg: WooConfig = { url, consumerKey, consumerSecret };
    const prev = process.env.WOO_AUTH_MODE;
    process.env.WOO_AUTH_MODE = authMode;
    try {
      if (action === "listCategories") {
        const search = String(payload?.search || "");
        const ep = search ? `wp-json/wc/v3/products/categories?search=${encodeURIComponent(search)}` : `wp-json/wc/v3/products/categories`;
        const res = await wooGet(cfg, ep);
        const txt = await res.text();
        return NextResponse.json({ ok: res.ok, status: res.status, contentType: res.headers.get("content-type") || "", body: txt });
      }
      if (action === "createCategory") {
        const name = String(payload?.name || "");
        if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
        const res = await wooPost(cfg, `wp-json/wc/v3/products/categories`, { name });
        const txt = await res.text();
        return NextResponse.json({ ok: res.ok, status: res.status, contentType: res.headers.get("content-type") || "", body: txt });
      }
      if (action === "listProducts") {
        const sku = String(payload?.sku || "");
        const slug = String(payload?.slug || "");
        let ep = `wp-json/wc/v3/products`;
        if (sku) ep = `wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`;
        else if (slug) ep = `wp-json/wc/v3/products?slug=${encodeURIComponent(slug)}`;
        const res = await wooGet(cfg, ep);
        const txt = await res.text();
        return NextResponse.json({ ok: res.ok, status: res.status, contentType: res.headers.get("content-type") || "", body: txt });
      }
      if (action === "createProduct") {
        const data = payload && typeof payload === "object" ? payload : {};
        const res = await wooPost(cfg, `wp-json/wc/v3/products`, data);
        const txt = await res.text();
        return NextResponse.json({ ok: res.ok, status: res.status, contentType: res.headers.get("content-type") || "", body: txt });
      }
      if (action === "updateProduct") {
        const id = String(payload?.id || "");
        const data = payload && typeof payload === "object" ? payload : {};
        if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
        const res = await wooPut(cfg, `wp-json/wc/v3/products/${id}`, data);
        const txt = await res.text();
        return NextResponse.json({ ok: res.ok, status: res.status, contentType: res.headers.get("content-type") || "", body: txt });
      }
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    } finally {
      process.env.WOO_AUTH_MODE = prev;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || "未知错误");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}