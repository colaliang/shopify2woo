export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  images?: { src: string }[];
  variants?: Array<{
    id: number;
    title: string;
    price?: string;
    sku?: string;
    compare_at_price?: string;
    option1?: string;
    option2?: string;
    option3?: string;
    image?: { src: string } | null;
  }>;
  options?: Array<{ name: string; values: string[] }>;
};

export async function fetchProductByHandle(shopifyBase: string, handle: string): Promise<ShopifyProduct | null> {
  const url = new URL(`/products/${handle}.json`, shopifyBase.replace(/\/$/, ""));
  const timeoutMs = parseInt(process.env.SHOPIFY_FETCH_TIMEOUT_MS || "10000", 10) || 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url.toString(), { signal: controller.signal });
  clearTimeout(timer);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.product || null;
}