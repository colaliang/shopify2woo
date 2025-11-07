import { NextResponse } from "next/server";
import { getSupabaseServer, readLocalConfig } from "@/lib/supabaseServer";
import { fetchProductByHandle } from "@/lib/shopify";
import { buildWooProductPayload, buildVariationFromShopifyVariant } from "@/lib/importMap";
import { ensureTerms, findProductBySkuOrSlug, wooPost, wooPut } from "@/lib/woo";

function normalizeHandleOrLink(value: string) {
  try {
    const u = new URL(value);
    const m = u.pathname.match(/\/products\/([^\/?#]+)/);
    if (m) return m[1];
  } catch {}
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { shopifyBaseUrl, productLinks, categories = [], tags = [] } = body || {};
    if (!shopifyBaseUrl) {
      return NextResponse.json({ error: "缺少 Shopify 站点网址" }, { status: 400 });
    }
    const handles = (Array.isArray(productLinks) ? productLinks : []).map(normalizeHandleOrLink).filter(Boolean);
    if (!handles.length) {
      return NextResponse.json({ error: "未提供产品链接或 handle" }, { status: 400 });
    }

    // 读取 Woo 配置（Supabase 优先，本地回退）
    let wordpressUrl = "";
    let consumerKey = "";
    let consumerSecret = "";
    try {
      const supabase = getSupabaseServer();
      if (supabase) {
        const { data } = await supabase
          .from("user_configs")
          .select("wordpress_url, consumer_key, consumer_secret")
          .limit(1)
          .maybeSingle();
        if (data) {
          wordpressUrl = data.wordpress_url || "";
          consumerKey = data.consumer_key || "";
          consumerSecret = data.consumer_secret || "";
        }
      }
    } catch {}
    if (!wordpressUrl || !consumerKey || !consumerSecret) {
      const local = readLocalConfig();
      wordpressUrl = wordpressUrl || local?.wordpressUrl || "";
      consumerKey = consumerKey || local?.consumerKey || "";
      consumerSecret = consumerSecret || local?.consumerSecret || "";
    }
    if (!wordpressUrl || !consumerKey || !consumerSecret) {
      return NextResponse.json({ error: "Woo 配置未设置" }, { status: 400 });
    }

    const wooCfg = { url: wordpressUrl, consumerKey, consumerSecret };

    // 确保分类与标签
    const catTerms = await ensureTerms(wooCfg, "category", categories);
    const tagTerms = await ensureTerms(wooCfg, "tag", tags);

    const results: Array<{ handle: string; id?: number; name?: string; error?: string }> = [];
    for (const handle of handles) {
      const product = await fetchProductByHandle(shopifyBaseUrl, handle);
      if (!product) {
        results.push({ handle, error: "Shopify 产品未找到" });
        continue;
      }
      const payload = buildWooProductPayload(product);
      payload.categories = catTerms;
      payload.tags = tagTerms;

      const existing = await findProductBySkuOrSlug(wooCfg, undefined, product.handle);
      let saved: { id?: number; name?: string };
      if (existing) {
        saved = await (await wooPut(wooCfg, `wp-json/wc/v3/products/${existing.id}`, payload)).json();
      } else {
        saved = await (await wooPost(wooCfg, "wp-json/wc/v3/products", { ...payload, slug: product.handle })).json();
      }

      if (Array.isArray(product.variants) && product.variants.length > 1) {
        for (const v of product.variants) {
          const varPayload = buildVariationFromShopifyVariant(v);
          await wooPost(wooCfg, `wp-json/wc/v3/products/${saved.id}/variations`, varPayload).then((r) => r.json());
        }
      }

      results.push({ handle, id: saved?.id, name: saved?.name });
    }

    const requestId = Math.random().toString(36).slice(2, 10);
    return NextResponse.json({ success: true, requestId, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}