import { cleanImageUrl } from "./importMap";
import { wooGet } from "./woo";

export type WooConfig = {
  url: string;
  consumerKey: string;
  consumerSecret: string;
};

export type WooProduct = {
  id?: number;
  name?: string;
  slug?: string;
  type?: string;
  sku?: string;
  description?: string;
  short_description?: string;
  regular_price?: string;
  sale_price?: string;
  images?: { src: string }[];
  attributes?: Array<{ name?: string; variation?: boolean; options?: string[] }>;
  default_attributes?: Array<{ id?: number; name?: string; option: string }>;
  categories?: Array<{ id?: number; name?: string }>;
  tags?: Array<{ id?: number; name?: string }>;
};

export type WooVariation = {
  id?: number;
  sku?: string;
  regular_price?: string;
  sale_price?: string;
  image?: { src?: string } | null;
  attributes?: Array<{ id?: number; name?: string; option?: string }>;
};

export function buildWooPayloadFromWooProduct(src: WooProduct) {
  const payload: Record<string, unknown> = {
    name: src.name,
    type: src.type || "simple",
    description: src.description || src.short_description || "",
    short_description: src.short_description || undefined,
    images: (src.images || [])
      .map((im) => ({ src: cleanImageUrl(im?.src) }))
      .filter((x) => x.src),
    attributes: (src.attributes || []).map((a) => ({
      name: a?.name,
      visible: true,
      variation: !!a?.variation,
      options: (a?.options || []).filter(Boolean),
    })),
    default_attributes: (src.default_attributes || []).map((d) => ({ name: d?.name, option: d.option })),
  };
  if ((src.type || "simple") === "simple") {
    Object.assign(payload, {
      sku: src.sku,
      regular_price: src.regular_price,
      sale_price: src.sale_price,
    });
  }
  return payload;
}

export async function fetchSourceProductsAll(cfg: WooConfig, perPage = 100) {
  const all: WooProduct[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await wooGet(cfg, `index.php/wp-json/wc/v3/products?per_page=${perPage}&page=${page}`);
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) break;
    all.push(...arr);
  }
  return all;
}

export async function fetchSourceProductBySlug(cfg: WooConfig, slug: string) {
  const res = await wooGet(cfg, `index.php/wp-json/wc/v3/products?slug=${encodeURIComponent(slug)}`);
  const arr = await res.json();
  return Array.isArray(arr) && arr.length ? (arr[0] as WooProduct) : null;
}

export async function fetchSourceVariations(cfg: WooConfig, productId: number, perPage = 100) {
  const all: WooVariation[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await wooGet(cfg, `index.php/wp-json/wc/v3/products/${productId}/variations?per_page=${perPage}&page=${page}`);
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) break;
    all.push(...arr);
  }
  return all;
}

export function getTermNames(src: WooProduct) {
  const categories = (src.categories || []).map((c) => String(c?.name || "").trim()).filter(Boolean);
  const tags = (src.tags || []).map((t) => String(t?.name || "").trim()).filter(Boolean);
  return { categories, tags };
}

export function normalizeWpSlugOrLink(value: string) {
  try {
    const u = new URL(value);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length) {
      const last = parts[parts.length - 1];
      return decodeURIComponent(String(last)).replace(/[\s`'";:]+$/g, "");
    }
  } catch {}
  return decodeURIComponent(value.trim()).replace(/^\/+|\/+$/g, "").replace(/[\s`'";:]+$/g, "");
}
