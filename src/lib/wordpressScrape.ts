import { cleanImageUrl } from "./importMap";

type LdProduct = {
  name?: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  category?: string | string[];
  offers?: { price?: string | number } | { [k: string]: unknown }[];
};

type LdOffer = {
  price?: string | number;
  [k: string]: unknown;
};

type BreadcrumbListItem = {
  name?: string;
  [k: string]: unknown;
};

type BreadcrumbList = {
  itemListElement?: BreadcrumbListItem[];
  [k: string]: unknown;
};

function htmlUnescape(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n/g, "")
    .replace(/\r/g, "");
}

const defaultHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.8,zh-CN;q=0.7,zh;q=0.6",
};

export async function fetchHtml(url: string) {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: defaultHeaders });
      if (res.status === 404) throw new Error(`无法获取页面 404`);
      if (!res.ok) throw new Error(`无法获取页面 ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || "未知错误"));
}

export async function fetchHtmlMeta(url: string) {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: defaultHeaders, redirect: "follow" });
      const text = await res.text();
      const finalUrl = res.url || url;
      
      // 检测网址不匹配：如果最终URL与原始URL不同，说明发生了重定向
      const urlMismatch = finalUrl !== url;
      
      return { 
        html: text, 
        status: res.status, 
        contentType: res.headers.get("content-type") || "", 
        finalUrl,
        urlMismatch,
        originalUrl: url
      };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || "未知错误"));
}

export function extractJsonLdProduct(html: string): LdProduct | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    try {
      const obj = JSON.parse(raw);
      const p = Array.isArray(obj) ? obj.find((x) => x && (x["@type"] === "Product" || x.name)) : obj;
      if (p && (p["@type"] === "Product" || p.name)) return p as LdProduct;
    } catch {}
  }
  return null;
}

export type ScrapedVariation = {
  attributes: Record<string, string>;
  regular_price?: string;
  sale_price?: string;
  image?: { src?: string } | null;
};

interface RawVariation {
  display_regular_price?: string | number;
  regular_price?: string | number;
  display_price?: string | number;
  image?: { src?: string; url?: string };
  attributes?: Record<string, string>;
}

export function extractProductVariations(html: string): ScrapedVariation[] {
  const attrMatch = html.match(/data-product_variations="([\s\S]*?)"/i);
  if (!attrMatch) return [];
  const raw = htmlUnescape(attrMatch[1]);
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((v: RawVariation) => {
      const rp = v?.display_regular_price ?? v?.regular_price;
      const sp = v?.display_price && rp && v.display_price < rp ? v.display_price : undefined;
      const img = v?.image?.src || v?.image?.url || undefined;
      return {
        attributes: v?.attributes || {},
        regular_price: rp ? String(rp) : undefined,
        sale_price: sp ? String(sp) : undefined,
        image: img ? { src: cleanImageUrl(String(img)) } : undefined,
      } as ScrapedVariation;
    });
  } catch {
    return [];
  }
}

function normalizeAttrName(k: string) {
  const s = k.replace(/^attribute_/, "").replace(/^pa_/, "");
  return s.replace(/_/g, " ");
}

export function buildPayloadFromScraped(url: string, ld: LdProduct | null, vars: ScrapedVariation[]) {
  const images: string[] = [];
  const ldImages = ld?.image;
  if (Array.isArray(ldImages)) images.push(...ldImages.map((x) => String(x)).filter(Boolean));
  else if (typeof ldImages === "string") images.push(ldImages);
  const payload: Record<string, unknown> = {
    name: ld?.name || url,
    type: vars.length > 1 ? "variable" : "simple",
    description: ld?.description || "",
    images: images.map((src) => ({ src: cleanImageUrl(src) })).filter((x) => x.src),
  };
  if (vars.length <= 1) {
    const sku = ld?.sku;
    const price = (() => {
      if (!ld?.offers) return undefined;
      if (Array.isArray(ld.offers)) {
        const first = (ld.offers as LdOffer[]).find((o: LdOffer) => o?.price);
        return first?.price ? String(first.price) : undefined;
      }
      const offer = ld.offers as LdOffer;
      return offer?.price ? String(offer.price) : undefined;
    })();
    Object.assign(payload, { sku, regular_price: price });
  } else {
    const allKeys = new Set<string>();
    vars.forEach((v) => Object.keys(v.attributes || {}).forEach((k) => allKeys.add(k)));
    const attributes = Array.from(allKeys).map((k) => {
      const opts = Array.from(new Set(vars.map((v) => v.attributes?.[k]).filter(Boolean)));
      return { name: normalizeAttrName(k), visible: true, variation: true, options: opts };
    });
    const first = vars[0];
    const defaults = attributes.map((a) => {
      const key = Array.from(allKeys).find((k) => normalizeAttrName(k) === a.name) || "";
      const val = first.attributes?.[key];
      return val ? { name: a.name, option: val } : null;
    }).filter(Boolean) as Array<{ name: string; option: string }>;
    Object.assign(payload, { attributes, default_attributes: defaults });
  }
  return { payload, variations: vars.map((v) => ({
    sku: undefined,
    regular_price: v.regular_price,
    sale_price: v.sale_price,
    image: v.image,
    attributes: Object.entries(v.attributes || {}).map(([k, val]) => ({ name: normalizeAttrName(k), option: String(val) })),
  })) };
}

export function extractBreadcrumbCategories(html: string) {
  const names: string[] = [];
  const jsonLdRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = jsonLdRe.exec(html))) {
    try {
      const obj = JSON.parse(m[1].trim());
      const arr = Array.isArray(obj) ? obj : [obj];
      const bl = arr.find((x) => x && x["@type"] === "BreadcrumbList");
      if (bl && Array.isArray((bl as BreadcrumbList).itemListElement)) {
        const list = (bl as BreadcrumbList).itemListElement!.map((it: BreadcrumbListItem) => it?.name).filter(Boolean);
        names.push(...(list as string[]));
        break;
      }
    } catch {}
  }
  if (!names.length) {
    const navMatch = html.match(/<nav[^>]*class="[^"]*woocommerce-breadcrumb[^"]*"[\s\S]*?<\/nav>/i);
    if (navMatch) {
      const aRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
      let am: RegExpExecArray | null;
      while ((am = aRe.exec(navMatch[0]))) {
        const txt = am[1].replace(/<[^>]+>/g, "").trim();
        if (txt) names.push(txt);
      }
    }
  }
  const cleaned = names.map((n) => String(n).trim()).filter(Boolean);
  return cleaned.filter((n) => /\S/.test(n)).slice(1).slice(0, -1);
}

export function extractTags(html: string) {
  const tags: string[] = [];
  const tagged = html.match(/<span[^>]*class="[^"]*tagged_as[^"]*"[\s\S]*?<\/span>/i);
  if (tagged) {
    const aRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let am: RegExpExecArray | null;
    while ((am = aRe.exec(tagged[0]))) {
      const txt = am[1].replace(/<[^>]+>/g, "").trim();
      if (txt) tags.push(txt);
    }
  }
  return Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
}

export function extractProductPrice(html: string) {
  const json = extractJsonLdProduct(html);
  if (json?.offers) {
    if (Array.isArray(json.offers)) {
      const first = (json.offers as LdOffer[]).find((o: LdOffer) => o?.price);
      if (first?.price) return String(first.price);
    } else {
      const o = json.offers as { price?: string | number };
      if (o?.price) return String(o.price);
    }
  }
  const priceBlock = html.match(/<p[^>]*class="[^"]*price[^"]*"[\s\S]*?<\/p>/i);
  if (priceBlock) {
    const num = priceBlock[0].match(/([0-9]+[\.,]?[0-9]*)/);
    if (num) return num[1].replace(/,/g, "");
  }
  return undefined;
}

export function extractFormAttributes(html: string) {
  const formMatch = html.match(/<form[^>]*class="[^"]*variations_form[^"]*"[\s\S]*?<\/form>/i);
  if (!formMatch) return [] as Array<{ name: string; options: string[] }>;
  const form = formMatch[0];
  const selects = form.match(/<select[\s\S]*?<\/select>/gi) || [];
  const out: Array<{ name: string; options: string[] }> = [];
  for (const sel of selects) {
    const nameMatch = sel.match(/name="([^"]+)"/i);
    const name = nameMatch ? normalizeAttrName(nameMatch[1]) : "";
    const opts: string[] = [];
    const oRe = /<option[^>]*value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/gi;
    let om: RegExpExecArray | null;
    while ((om = oRe.exec(sel))) {
      const val = String(om[1] || "").trim();
      const label = String(om[2] || "").replace(/<[^>]+>/g, "").trim();
      const v = val || label;
      if (v && !/choose|选择|请选择/i.test(v)) opts.push(v);
    }
    const uniq = Array.from(new Set(opts.filter(Boolean)));
    if (name && uniq.length) out.push({ name, options: uniq });
  }
  return out;
}

export function buildVariationsFromForm(attrs: Array<{ name: string; options: string[] }>, price?: string, cap = 100) {
  if (!attrs.length) return [] as ScrapedVariation[];
  const lists = attrs.map((a) => a.options);
  let combos: string[][] = [[]];
  for (const list of lists) {
    const next: string[][] = [];
    for (const c of combos) {
      for (const opt of list) next.push([...c, opt]);
    }
    combos = next;
    if (combos.length > cap) break;
  }
  const out: ScrapedVariation[] = combos.slice(0, cap).map((vals) => {
    const attributes: Record<string, string> = {};
    attrs.forEach((a, i) => (attributes[a.name] = vals[i]));
    return { attributes, regular_price: price };
  });
  return out;
}

export async function discoverProductLinksFromSitemaps(base: string) {
  const urls = ["/sitemap_index.xml", "/product-sitemap.xml", "/sitemap.xml"];
  const links: string[] = [];
  for (const u of urls) {
    try {
      const res = await fetch(new URL(u, base.replace(/\/$/, "")).toString());
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)).map((m) => m[1].trim());
      for (const loc of locs) {
        if (/\.xml(\?.*)?$/i.test(loc)) {
          try {
            const r = await fetch(loc);
            if (!r.ok) continue;
            const child = await r.text();
            const childLocs = Array.from(child.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)).map((m) => m[1].trim());
            childLocs.forEach((c) => { if (/\/product\//i.test(c)) links.push(c); });
          } catch {}
        } else {
          if (/\/product\//i.test(loc)) links.push(loc);
        }
      }
    } catch {}
  }
  return Array.from(new Set(links));
}

export async function discoverProductLinksFromShop(base: string, maxPages = 20) {
  const links: string[] = [];
  let url = new URL("/shop/", base.replace(/\/$/, "")).toString();
  for (let i = 0; i < maxPages; i++) {
    try {
      const html = await fetchHtml(url);
      const aRe = /<a[^>]*href="([^"]+)"[^>]*class="[^"]*(woocommerce-LoopProduct-link|woocommerce-LoopProduct__link)[^"]*"[^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = aRe.exec(html))) {
        const href = m[1];
        if (/\/product\//i.test(href)) links.push(new URL(href, base).toString());
      }
      const next = html.match(/<a[^>]*rel="next"[^>]*href="([^"]+)"[^>]*>/i);
      if (next) url = new URL(next[1], base).toString(); else break;
    } catch { break; }
  }
  return Array.from(new Set(links));
}

export async function discoverAllProductLinks(base: string, cap = 1000) {
  const a = await discoverProductLinksFromSitemaps(base);
  const b = await discoverProductLinksFromShop(base);
  const c = await discoverProductLinksFromKnownPaths(base);
  const d = await discoverProductLinksFromCategories(base);
  const e = await discoverProductLinksByBfs(base, 30);
  const all = Array.from(new Set([...a, ...b, ...c, ...d, ...e]));
  return all.slice(0, cap);
}

export function extractDescriptionHtml(html: string) {
  const candidates = [
    /<div[^>]*class="[^"]*woocommerce-product-details__short-description[^"]*"[\s\S]*?<\/div>/i,
    /<div[^>]*class="[^"]*entry-content[^"]*"[\s\S]*?<\/div>/i,
    /<div[^>]*class="[^"]*woocommerce-Tabs-panel[^"]*description[^"]*"[\s\S]*?<\/div>/i,
  ];
  for (const re of candidates) {
    const m = html.match(re);
    if (m) return m[0];
  }
  const json = extractJsonLdProduct(html);
  return json?.description || "";
}

export function extractGalleryImages(html: string) {
  const out: string[] = [];
  const figRe = /<figure[^>]*class="[^"]*woocommerce-product-gallery__image[^"]*"[\s\S]*?<\/figure>/gi;
  let m: RegExpExecArray | null;
  while ((m = figRe.exec(html))) {
    const block = m[0];
    const href = block.match(/href="([^"]+)"/i)?.[1];
    const img = block.match(/src="([^"]+)"/i)?.[1];
    const srcset = block.match(/srcset="([^"]+)"/i)?.[1];
    const dataSrc = block.match(/data-src="([^"]+)"/i)?.[1];
    const bestFromSrcset = srcset ? pickLargestFromSrcset(srcset) : undefined;
    const src = href || bestFromSrcset || dataSrc || img;
    if (src) out.push(src);
  }
  return Array.from(new Set(out.map((s) => cleanImageUrl(s)))).filter(Boolean) as string[];
}

export function extractPostedInCategories(html: string) {
  const cats: string[] = [];
  const block = html.match(/<span[^>]*class="[^"]*posted_in[^"]*"[\s\S]*?<\/span>/i)?.[0];
  if (block) {
    const re = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      const txt = m[1].replace(/<[^>]+>/g, "").trim();
      if (txt) cats.push(txt);
    }
  }
  return Array.from(new Set(cats.map((c) => c.trim()).filter(Boolean)));
}

export function extractSku(html: string) {
  const m = html.match(/<span[^>]*class="[^"]*sku[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  if (m) {
    const txt = m[1].replace(/<[^>]+>/g, "").trim();
    if (txt) return txt;
  }
  return undefined;
}

export function extractOgImages(html: string) {
  const out: string[] = [];
  const re = /<meta[^>]+(?:property|name)="(?:og:image|twitter:image)"[^>]*content="([^"]+)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1];
    if (url) out.push(url);
  }
  return Array.from(new Set(out.map((s) => cleanImageUrl(s)))).filter(Boolean) as string[];
}

export function extractContentImages(html: string) {
  const out: string[] = [];
  const blocks = html.match(/<div[^>]*class="[^"]*(entry-content|product)[^"]*"[\s\S]*?<\/div>/gi) || [];
  for (const b of blocks) {
    const imgRe = /<img[^>]+(srcset|data-src|src)="([^"]+)"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(b))) {
      const attr = m[1];
      const val = m[2];
      if (attr === 'srcset') {
        const best = pickLargestFromSrcset(val);
        if (best) out.push(best);
      } else {
        out.push(val);
      }
    }
  }
  return Array.from(new Set(out.map((s) => cleanImageUrl(s)))).filter(Boolean) as string[];
}

function pickLargestFromSrcset(srcset: string) {
  try {
    const parts = srcset.split(',').map(s => s.trim());
    let best: { url: string; width: number } | null = null;
    for (const p of parts) {
      const m = p.match(/([^\s]+)\s+(\d+)w/);
      const url = (m ? m[1] : p.split(' ')[0]) || '';
      const w = m ? parseInt(m[2], 10) : 0;
      if (url && (!best || w > best.width)) best = { url, width: w };
    }
    return best?.url || undefined;
  } catch {
    return undefined;
  }
}

function extractProductLinksFromHtml(base: string, html: string) {
  const links: string[] = [];
  const aRe = /<a[^>]*href="([^"]+)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = aRe.exec(html))) {
    const href = m[1];
    if (/\/product\//i.test(href) || /post_type=product/i.test(href)) {
      links.push(new URL(href, base).toString());
    }
  }
  return Array.from(new Set(links));
}

export async function discoverProductLinksFromKnownPaths(base: string) {
  const paths = [
    "/product/",
    "/products/",
    "/shop/",
    "/?post_type=product",
  ];
  const links: string[] = [];
  for (const p of paths) {
    try {
      let url = new URL(p, base.replace(/\/$/, "")).toString();
      for (let i = 0; i < 10; i++) {
        const html = await fetchHtml(url);
        extractProductLinksFromHtml(base, html).forEach((l) => links.push(l));
        const next = html.match(/<a[^>]*rel="next"[^>]*href="([^"]+)"[^>]*>/i);
        if (next) url = new URL(next[1], base).toString(); else break;
      }
    } catch {}
  }
  return Array.from(new Set(links));
}

export async function discoverProductLinksFromCategories(base: string) {
  const indexCandidates = [
    "/product-category/",
    "/shop/",
  ];
  const catLinks: string[] = [];
  for (const p of indexCandidates) {
    try {
      const html = await fetchHtml(new URL(p, base.replace(/\/$/, "")).toString());
      const aRe = /<a[^>]*href="([^"]+)"[^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = aRe.exec(html))) {
        const href = m[1];
        if (/\/product-category\//i.test(href)) catLinks.push(new URL(href, base).toString());
      }
    } catch {}
  }
  const prodLinks: string[] = [];
  for (const cat of Array.from(new Set(catLinks))) {
    try {
      let url = cat;
      for (let i = 0; i < 10; i++) {
        const html = await fetchHtml(url);
        extractProductLinksFromHtml(base, html).forEach((l) => prodLinks.push(l));
        const next = html.match(/<a[^>]*rel="next"[^>]*href="([^"]+)"[^>]*>/i);
        if (next) url = new URL(next[1], base).toString(); else break;
      }
    } catch {}
  }
  return Array.from(new Set(prodLinks));
}

export async function discoverProductLinksByBfs(base: string, maxPages = 30) {
  const visited = new Set<string>();
  const queue: string[] = [new URL("/", base.replace(/\/$/, "")).toString()];
  const prod: string[] = [];
  while (queue.length && visited.size < maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const html = await fetchHtml(url);
      extractProductLinksFromHtml(base, html).forEach((l) => prod.push(l));
      const aRe = /<a[^>]*href="([^"]+)"[^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = aRe.exec(html))) {
        const href = m[1];
        if (/^https?:\/\//i.test(href)) {
          const u = new URL(href);
          if (u.host === new URL(base).host) queue.push(u.toString());
        } else {
          queue.push(new URL(href, base).toString());
        }
      }
    } catch {}
  }
  return Array.from(new Set(prod));
}
