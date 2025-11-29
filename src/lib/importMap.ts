import type { ShopifyProduct } from "./shopify";

export function cleanImageUrl(url?: string) {
  if (!url) return undefined;
  return url.replace(/\?.*$/, "");
}

function parseFloatSafe(v?: string) {
  const n = parseFloat(String(v || "").trim());
  return isFinite(n) ? n : undefined;
}

export function computePriceFields(variant: NonNullable<ShopifyProduct["variants"]>[number]) {
  const price = parseFloatSafe(variant?.price);
  const compare = parseFloatSafe(variant?.compare_at_price);
  return { regular_price: price ? String(price) : undefined, sale_price: compare && price && compare > price ? String(price) : undefined };
}

export function createAttributes(product: ShopifyProduct) {
  const attrs: Array<{ name: string; visible: boolean; variation: boolean; options: string[] }> = [];
  for (const opt of product.options || []) {
    const name = String(opt?.name || "").trim();
    if (!name) continue;
    const options = (opt.values || []).map((v) => String(v || "").trim()).filter(Boolean);
    attrs.push({ name, visible: true, variation: true, options });
  }
  return attrs;
}

export function buildDefaultAttributes(product: ShopifyProduct): Array<{ name: string; option: string }> {
  const defaults: Array<{ name: string; option: string }> = [];
  if (!product.options || !product.options.length) return defaults;
  const firstVariant = product.variants?.[0];
  if (!firstVariant) return defaults;
  const optVals = [firstVariant.option1, firstVariant.option2, firstVariant.option3].filter(Boolean);
  product.options.forEach((opt, idx) => {
    const val = optVals[idx];
    if (val && opt.name) defaults.push({ name: opt.name, option: val });
  });
  return defaults;
}

export function buildImages(product: ShopifyProduct) {
  const imgs = (product.images || []).map((im) => ({ src: cleanImageUrl(im?.src) })).filter((x): x is { src: string } => !!x.src);
  return imgs;
}

type WooAttribute = { name?: string; option?: string };
type WooImage = { src: string };
type WooVariationPartial = {
  sku?: string;
  regular_price?: string;
  sale_price?: string;
  image?: WooImage;
  attributes: WooAttribute[];
};

export interface WooProductPayload {
  name?: string;
  slug?: string;
  type?: string;
  description?: string;
  short_description?: string;
  images?: WooImage[];
  attributes?: Array<{ name: string; visible: boolean; variation: boolean; options: string[] }>;
  default_attributes?: Array<{ name: string; option: string }>;
  sku?: string;
  regular_price?: string;
  sale_price?: string;
  categories?: Array<{ id?: number; name?: string }>;
  tags?: Array<{ id?: number; name?: string }>;
}

export function buildVariationFromShopifyVariant(
  variant: NonNullable<ShopifyProduct["variants"]>[number],
  productOptions: NonNullable<ShopifyProduct["options"]>
): WooVariationPartial {
  const attrs: Array<{ name?: string; option?: string }> = [];
  const opts = [variant.option1, variant.option2, variant.option3];
  productOptions.forEach((pOpt, idx) => {
    const val = opts[idx];
    if (val && pOpt.name) {
      attrs.push({ name: pOpt.name, option: val });
    }
  });
  const prices = computePriceFields(variant);
  const img = cleanImageUrl(variant?.image?.src || undefined);
  return {
    sku: variant?.sku,
    ...prices,
    image: img ? { src: img } : undefined,
    attributes: attrs.filter((a) => a.option && a.name),
  };
}

export function buildWooProductPayload(product: ShopifyProduct): WooProductPayload {
  const isVariable = (product.options || []).length > 0 && (product.variants || []).length > 1;
  const payload: WooProductPayload = {
    name: product.title,
    type: isVariable ? "variable" : "simple",
    description: product.body_html || "",
    images: buildImages(product),
    attributes: createAttributes(product),
    default_attributes: buildDefaultAttributes(product),
  };
  if (!isVariable) {
    const v = product.variants?.[0];
    if (v) {
      const variation = buildVariationFromShopifyVariant(v, product.options || []);
      Object.assign(payload, {
        sku: variation.sku,
        regular_price: variation.regular_price,
        sale_price: variation.sale_price
      });
    }
  }
  return payload;
}
