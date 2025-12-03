import { cleanImageUrl } from "./importMap";
import { fetchHtml, extractJsonLdProduct, extractBreadcrumbCategories, extractTags, extractOuterHtml } from "./wordpressScrape";

type LdProduct = {
  name?: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  category?: string | string[];
  offers?: { price?: string | number } | { [k: string]: unknown }[];
};

type WixOptionValue = {
  value?: string;
  name?: string;
  [k: string]: unknown;
};

type WixOffer = {
  price?: string | number;
  [k: string]: unknown;
};

function toArray<T>(v: T | T[] | undefined) {
  return Array.isArray(v) ? v : v ? [v] : [];
}

// Extract full Wix product object from JSON
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractWixProductData(html: string): any {
  // 1. Try standard application/json script
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const obj = JSON.parse(m[1].trim());
      const p = obj?.product || obj?.data?.product || obj?.pageData?.product;
      if (p) return p;
      if (obj?.catalog?.product) return obj.catalog.product;
    } catch {}
  }

  // 2. Try finding "var warmUpData = {...}" or similar pattern
  // This is more aggressive and might catch false positives if not careful,
  // but we look for "product" key inside.
  const warmupRe = /var\s+(?:warmUpData|publicModel)\s*=\s*({[\s\S]*?});/gi;
  while ((m = warmupRe.exec(html))) {
      try {
          const obj = JSON.parse(m[1].trim());
          // Look for product data deeply if needed, or just top level
          if (obj?.product) return obj.product;
          if (obj?.appsUrlData?.product) return obj.appsUrlData.product;
          
          // Sometimes it's in a nested structure like appsUrlData -> instance -> ...
          // But usually warmUpData has a catalog key
          if (obj?.catalog?.product) return obj.catalog.product;
      } catch {}
  }

  return null;
}

export function extractWixOptions(html: string) {
  const opts: Array<{ name: string; options: string[] }> = [];
  const product = extractWixProductData(html);
  
  if (product) {
      const options = product?.options || product?.productOptions;
      if (Array.isArray(options)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const o of options) {
          const name = String(o?.name || o?.title || "").trim();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const values = toArray(o?.choices || o?.options || o?.values).map((x: any) => String(x?.value || x?.name || x || "").trim()).filter(Boolean);
          if (name && values.length) opts.push({ name, options: Array.from(new Set(values)) });
        }
      }
      return opts;
  }

  // Fallback: try regex loop again if extractWixProductData failed
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const obj = JSON.parse(m[1].trim());
      const p = obj?.product || obj?.data?.product || obj?.pageData?.product;
      const options = p?.options || p?.productOptions || obj?.options;
      if (Array.isArray(options)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const o of options) {
          const name = String(o?.name || o?.title || "").trim();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const values = toArray(o?.choices || o?.options || o?.values).map((x: any) => String(x?.value || x?.name || x || "").trim()).filter(Boolean);
          if (name && values.length) opts.push({ name, options: Array.from(new Set(values)) });
        }
      }
    } catch {}
  }
  
  // Deduplicate by name
  const uniqueOpts = new Map<string, string[]>();
  opts.forEach(o => uniqueOpts.set(o.name, o.options));
  return Array.from(uniqueOpts.entries()).map(([name, options]) => ({ name, options }));
}

function extractImageSource(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = v as any;
    const u = o.url || o.contentUrl || o.src || o.fullUrl || o.href;
    return typeof u === 'string' ? u : null;
  }
  return null;
}

export function extractWixPrice(html: string) {
  const product = extractWixProductData(html);
  if (product) {
      // check product.price, product.pricePerUnit, etc.
      if (product.price) return String(product.price);
      if (product.formattedPrice) return String(product.formattedPrice).replace(/[^0-9.]/g, "");
  }

  const ld = extractJsonLdProduct(html) as LdProduct | null;
  if (ld?.offers) {
    if (Array.isArray(ld.offers)) {
      const first = ld.offers.find((o: WixOffer) => o?.price);
      if (first?.price) return String(first.price);
    } else {
      const o = ld.offers as { price?: string | number };
      if (o?.price) return String(o.price);
    }
  }
  const m = html.match(/\"price\"\s*:\s*\"?([0-9]+[\.,]?[0-9]*)\"?/i);
  return m ? m[1].replace(/,/g, "") : undefined;
}

export function extractWixDescriptionFromHtml(html: string) {
    // 1. Try data-hook
    const hooks = ['description', 'product-description', 'product-page-description'];
    for (const hook of hooks) {
        const re = new RegExp(`<([a-z0-9]+)[^>]*data-hook="${hook}"[^>]*>`, 'i');
        const out = extractOuterHtml(html, re);
        if (out) {
             // Get inner HTML of this block
             const inner = out.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, '');
             if (inner && inner.length > 10) return inner.trim();
        }
    }
    return null;
}

export function buildWixPayload(linkUrl: string, html: string) {
  const ld = extractJsonLdProduct(html) as LdProduct | null;
  const wixData = extractWixProductData(html);

  const images: string[] = [];
  const seenImages = new Set<string>();

  const addImage = (url: string | null) => {
      if (url && !seenImages.has(url)) {
          images.push(url);
          seenImages.add(url);
      }
  };

  // 1. JSON-LD Images (Prioritize these as they are likely high quality/SEO optimized)
  if (ld?.image) {
      const ldImages = Array.isArray(ld.image) ? ld.image : [ld.image];
      ldImages.forEach(x => addImage(extractImageSource(x)));
  }

  // 2. Wix Data Media (Append/Merge)
  if (wixData && Array.isArray(wixData.media)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wixData.media.forEach((m: any) => {
          addImage(extractImageSource(m));
      });
  }
  
  // 3. Fallback: extract og:image, twitter:image, link rel=image_src
  if (images.length === 0) {
    const patterns = [
        /<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/gi,
        /<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"[^>]*>/gi,
        /<link[^>]*rel="image_src"[^>]*href="([^"]*)"[^>]*>/gi
    ];
    for (const re of patterns) {
        const matches = html.matchAll(re);
        for (const m of matches) {
            if (m[1]) addImage(m[1]);
        }
    }
  }

  const opts = extractWixOptions(html);
  
  // Name: Prefer LD if available, as it's usually cleaner
  let name = ld?.name || wixData?.name || wixData?.title;
  if (!name) {
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i);
    if (ogTitle) name = ogTitle[1];
  }

  // Description: Prefer LD
  // Wix data description might be HTML or text
  let description = ld?.description || wixData?.description;
  
  // Try HTML scraping via data-hook
  if (!description) {
      description = extractWixDescriptionFromHtml(html);
  }

  if (!description) {
     const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i);
     if (ogDesc) description = ogDesc[1];
  }
  // Fallback: meta name="description"
  if (!description) {
     const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
     if (metaDesc) description = metaDesc[1];
  }

  const payload: Record<string, unknown> = {
    name: name || linkUrl,
    type: opts.length > 0 ? "variable" : "simple",
    description: description || "",
    images: images.map((src) => ({ src: cleanImageUrl(src) })).filter((x) => x.src),
  };
  if (opts.length) {
    const attributes = opts.map((o) => ({ name: o.name, visible: true, variation: true, options: o.options }));
    const defaults = opts.map((o) => ({ name: o.name, option: o.options[0] })).filter((x) => x.option);
    Object.assign(payload, { attributes, default_attributes: defaults });
  } else {
    const price = extractWixPrice(html);
    Object.assign(payload, { sku: ld?.sku || wixData?.sku, regular_price: price });
  }
  const categories = (() => {
    const arr = extractBreadcrumbCategories(html);
    const fromLd = toArray(ld?.category).map((x) => String(x).trim()).filter(Boolean);
    return Array.from(new Set([...arr, ...fromLd]));
  })();
  const tags = extractTags(html);
  return { payload, categories, tags, ld };
}

export function buildWixVariationsFromHtml(html: string) {
  const opts = extractWixOptions(html);
  const price = extractWixPrice(html);
  const attributes = opts.map((o) => ({ name: o.name, visible: true, variation: true, options: o.options }));
  const default_attributes = opts.map((o) => ({ name: o.name, option: o.options[0] })).filter((x) => x.option);
  type VarAttr = { name: string; option: string };
  const variations: Array<{ attributes: VarAttr[]; regular_price?: string }> = [];
  function cartesian(names: string[], lists: string[][], acc: VarAttr[]) {
    if (!names.length) {
      const v: { attributes: VarAttr[]; regular_price?: string } = { attributes: acc.slice() };
      if (price) v.regular_price = String(price);
      variations.push(v);
      return;
    }
    const [n, ...restNames] = names;
    const [list, ...restLists] = lists;
    for (const opt of list) cartesian(restNames, restLists, [...acc, { name: n, option: opt }]);
  }
  if (opts.length) {
    const names = opts.map((o) => o.name);
    const lists = opts.map((o) => o.options);
    cartesian(names, lists, []);
  }
  return { attributes, default_attributes, variations };
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
