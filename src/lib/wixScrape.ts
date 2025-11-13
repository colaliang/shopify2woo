import { cleanImageUrl } from "./importMap";
import { fetchHtml, extractJsonLdProduct, extractBreadcrumbCategories, extractTags } from "./wordpressScrape";

type LdProduct = {
  name?: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  category?: string | string[];
  offers?: { price?: string | number } | { [k: string]: unknown }[];
};

function toArray<T>(v: T | T[] | undefined) {
  return Array.isArray(v) ? v : v ? [v] : [];
}

export function extractWixOptions(html: string) {
  const opts: Array<{ name: string; options: string[] }> = [];
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const obj = JSON.parse(m[1].trim());
      const product = obj?.product || obj?.data?.product || obj?.pageData?.product;
      const options = product?.options || product?.productOptions || obj?.options;
      if (Array.isArray(options)) {
        for (const o of options) {
          const name = String(o?.name || o?.title || "").trim();
          const values = toArray(o?.choices || o?.options || o?.values).map((x: any) => String(x?.value || x?.name || x || "").trim()).filter(Boolean);
          if (name && values.length) opts.push({ name, options: Array.from(new Set(values)) });
        }
      }
    } catch {}
  }
  return opts;
}

export function extractWixPrice(html: string) {
  const ld = extractJsonLdProduct(html) as LdProduct | null;
  if (ld?.offers) {
    if (Array.isArray(ld.offers)) {
      const first = ld.offers.find((o: any) => o?.price);
      if (first?.price) return String(first.price);
    } else {
      const o: any = ld.offers;
      if (o?.price) return String(o.price);
    }
  }
  const m = html.match(/\"price\"\s*:\s*\"?([0-9]+[\.,]?[0-9]*)\"?/i);
  return m ? m[1].replace(/,/g, "") : undefined;
}

export function buildWixPayload(linkUrl: string, html: string) {
  const ld = extractJsonLdProduct(html) as LdProduct | null;
  const images: string[] = [];
  const ldImages = ld?.image;
  if (Array.isArray(ldImages)) images.push(...ldImages.map((x) => String(x)).filter(Boolean));
  else if (typeof ldImages === "string") images.push(ldImages);
  const opts = extractWixOptions(html);
  const payload: Record<string, unknown> = {
    name: ld?.name || linkUrl,
    type: opts.length > 1 ? "variable" : "simple",
    description: ld?.description || "",
    images: images.map((src) => ({ src: cleanImageUrl(src) })).filter((x) => x.src),
  };
  if (opts.length) {
    const attributes = opts.map((o) => ({ name: o.name, visible: true, variation: true, options: o.options }));
    const defaults = opts.map((o) => ({ name: o.name, option: o.options[0] })).filter((x) => x.option);
    Object.assign(payload, { attributes, default_attributes: defaults });
  } else {
    const price = extractWixPrice(html);
    Object.assign(payload, { sku: ld?.sku, regular_price: price });
  }
  const categories = (() => {
    const arr = extractBreadcrumbCategories(html);
    const fromLd = toArray(ld?.category).map((x) => String(x).trim()).filter(Boolean);
    return Array.from(new Set([...arr, ...fromLd]));
  })();
  const tags = extractTags(html);
  return { payload, categories, tags, ld };
}

function extractLinksFromHtml(base: string, html: string) {
  const out: string[] = [];
  const re = /<a[^>]*href="([^"]+)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (/\/product-page\//i.test(href) || /\/store\/products\//i.test(href) || /\/product\//i.test(href)) {
      out.push(new URL(href, base).toString());
    }
  }
  return Array.from(new Set(out));
}

export async function discoverWixProductLinks(base: string, cap = 1000) {
  const candidates = ["/sitemap.xml", "/sitemap-index.xml", "/store", "/shop", "/products"];
  const links: string[] = [];
  for (const p of candidates) {
    try {
      const url = new URL(p, base.replace(/\/$/, "")).toString();
      const html = await fetchHtml(url);
      if (/^<\?xml/.test(html)) {
        const locs = Array.from(html.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)).map((m) => m[1].trim());
        locs.forEach((loc) => { if (/product/i.test(loc)) links.push(loc); });
      } else {
        extractLinksFromHtml(base, html).forEach((l) => links.push(l));
      }
    } catch {}
    if (links.length >= cap) break;
  }
  return Array.from(new Set(links)).slice(0, cap);
}

