import { cleanImageUrl } from "./importMap";
import { normalizeWpSlugOrLink } from "./wordpress";

let ProxyAgentRef: (new (proxy: string) => unknown) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const undici = require("undici");
  ProxyAgentRef = undici?.ProxyAgent || null;
} catch {}
function getDispatcherFromEnv() {
  try {
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (ProxyAgentRef && proxy) return new ProxyAgentRef(proxy);
  } catch {}
  return undefined;
}

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
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "max-age=0",
  "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Connection": "keep-alive"
};

export async function fetchHtml(url: string) {
  let lastErr: unknown;
  const timeoutMs = parseInt(process.env.SCRAPE_FETCH_TIMEOUT_MS || "15000", 10) || 15000;
  for (let i = 0; i < 3; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const headers = { ...defaultHeaders } as Record<string, string>;
      try { headers["Referer"] = new URL(url).origin; } catch {}
      type UndiciRequestInit = RequestInit & { dispatcher?: unknown };
      const dispatcher = getDispatcherFromEnv();
      const res = await fetch(url, { headers, signal: controller.signal, redirect: "follow", cache: "no-store", ...(dispatcher ? ({ dispatcher } as UndiciRequestInit) : {}) });
      clearTimeout(timer);
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
  const timeoutMs = parseInt(process.env.SCRAPE_FETCH_TIMEOUT_MS || "15000", 10) || 15000;
  for (let i = 0; i < 3; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const headers = { ...defaultHeaders } as Record<string, string>;
      try { headers["Referer"] = new URL(url).origin; } catch {}
      type UndiciRequestInit = RequestInit & { dispatcher?: unknown };
      const dispatcher = getDispatcherFromEnv();
      const res = await fetch(url, { headers, redirect: "follow", signal: controller.signal, cache: "no-store", ...(dispatcher ? ({ dispatcher } as UndiciRequestInit) : {}) });
      clearTimeout(timer);
      const text = await res.text();
      const ct = res.headers.get("content-type") || "";
      const finalUrl = ct.startsWith("image/") ? url : (res.url || url);
      const urlMismatch = finalUrl !== url;
      return { 
        html: text, 
        status: res.status, 
        contentType: ct, 
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
      // Handle Yoast/RankMath @graph format
      if (obj["@graph"] && Array.isArray(obj["@graph"])) {
        const graph = obj["@graph"];
        // Try to find explicit Product
        const p = graph.find((x: any) => x && x["@type"] === "Product");
        if (p) return p as LdProduct;
        
        // Fallback: Find WebPage or WebSite that might have product info
        const webPage = graph.find((x: any) => x && (x["@type"] === "WebPage" || x["@type"] === "ItemPage"));
        if (webPage && webPage.name) {
           // If we found a WebPage with a name, return it as a partial product
           // We might be able to find image in graph that is linked?
           // For now just return the WebPage as it has name/desc
           return webPage as LdProduct;
        }
      }
      
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

export function extractProductPrices(html: string) {
  let regular_price: string | undefined;
  let sale_price: string | undefined;

  // 1. Try HTML for sale/regular pair
  const priceBlock = html.match(/<p[^>]*class="[^"]*price[^"]*"[\s\S]*?<\/p>/i);
  if (priceBlock) {
    const block = priceBlock[0];
    // Clean HTML entities to avoid matching &#36; as 36. Keep tags for structure check.
    const cleanBlock = block.replace(/&#[0-9]+;/g, "").replace(/&#x[0-9a-f]+;/ig, "");
    
    const delMatch = block.match(/<del[^>]*>([\s\S]*?)<\/del>/i);
    const insMatch = block.match(/<ins[^>]*>([\s\S]*?)<\/ins>/i);
    
    if (delMatch && insMatch) {
        const regText = delMatch[1].replace(/&#[0-9]+;/g, "").replace(/&#x[0-9a-f]+;/ig, "");
        const saleText = insMatch[1].replace(/&#[0-9]+;/g, "").replace(/&#x[0-9a-f]+;/ig, "");
        
        const regNum = regText.match(/([0-9]+[\.,]?[0-9]*)/);
        const saleNum = saleText.match(/([0-9]+[\.,]?[0-9]*)/);
        if (regNum) regular_price = regNum[1].replace(/,/g, "");
        if (saleNum) sale_price = saleNum[1].replace(/,/g, "");
    } else {
        const num = cleanBlock.match(/([0-9]+[\.,]?[0-9]*)/);
        if (num) regular_price = num[1].replace(/,/g, "");
    }
  }

  // 2. Fallback/Supplement with JSON-LD
  const json = extractJsonLdProduct(html);
  if (json?.offers) {
     if (!regular_price) {
         const offers = Array.isArray(json.offers) ? json.offers : [json.offers];
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         const first = offers.find((o: any) => o?.price || o?.priceSpecification) as any;
         if (first) {
            if (first.price) {
               regular_price = String(first.price);
            } else if (first.priceSpecification) {
               const specs = Array.isArray(first.priceSpecification) ? first.priceSpecification : [first.priceSpecification];
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               const spec = specs.find((s: any) => s.price);
               if (spec) regular_price = String(spec.price);
            }
         }
     }
  }
  return { regular_price, sale_price };
}

export function extractProductPrice(html: string) {
  const p = extractProductPrices(html);
  return p.regular_price;
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

export function extractAdditionalAttributes(html: string) {
  const out: Array<{ name: string; options: string[] }> = [];
  const tableMatch = html.match(/<table[^>]*class="[^"]*woocommerce-product-attributes[^"]*"[\s\S]*?<\/table>/i);
  if (tableMatch) {
    const rowRe = /<tr[^>]*class="[^"]*woocommerce-product-attributes-item[^"]*"[\s\S]*?<\/tr>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(tableMatch[0]))) {
      const row = m[0];
      const label = row.match(/<th[^>]*class="[^"]*woocommerce-product-attributes-item__label[^"]*"[^>]*>([\s\S]*?)<\/th>/i)?.[1];
      const value = row.match(/<td[^>]*class="[^"]*woocommerce-product-attributes-item__value[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1];
      if (label && value) {
        const name = label.replace(/<[^>]+>/g, "").trim();
        const valTxt = value.replace(/<p>/gi, "").replace(/<\/p>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
        const options = valTxt.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
        if (name && options.length) out.push({ name, options });
      }
    }
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), parseInt(process.env.SCRAPE_FETCH_TIMEOUT_MS || "15000", 10) || 15000);
      type UndiciRequestInit = RequestInit & { dispatcher?: unknown };
      const dispatcher = getDispatcherFromEnv();
      const res = await fetch(new URL(u, base.replace(/\/$/, "")).toString(), { signal: controller.signal, ...(dispatcher ? ({ dispatcher } as UndiciRequestInit) : {}) });
      clearTimeout(timer);
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)).map((m) => m[1].trim());
      for (const loc of locs) {
        if (/\.xml(\?.*)?$/i.test(loc)) {
          try {
            const controller2 = new AbortController();
            const timer2 = setTimeout(() => controller2.abort(), parseInt(process.env.SCRAPE_FETCH_TIMEOUT_MS || "15000", 10) || 15000);
            const r = await fetch(loc, { signal: controller2.signal, ...(dispatcher ? ({ dispatcher } as UndiciRequestInit) : {}) });
            clearTimeout(timer2);
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

export function extractOuterHtml(html: string, startRegex: RegExp) {
  const m = html.match(startRegex);
  if (!m || m.index === undefined) return "";
  
  const startIndex = m.index;
  // Find the opening tag
  const openTag = m[0];
  const openTagEnd = startIndex + openTag.length;
  
  // Detect tag name
  const tagMatch = openTag.match(/^<([a-z0-9]+)/i);
  const tagName = tagMatch ? tagMatch[1].toLowerCase() : "div";

  let balance = 1;
  let pos = openTagEnd;
  
  // Heuristic to find balanced closing tag
  while (balance > 0 && pos < html.length) {
    const nextOpen = html.indexOf("<" + tagName, pos);
    const nextClose = html.indexOf("</" + tagName + ">", pos);
    
    if (nextClose === -1) break; // Unbalanced
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      balance++;
      pos = nextOpen + tagName.length + 1; 
    } else {
      balance--;
      pos = nextClose + tagName.length + 3; 
    }
  }
  
  if (balance === 0) {
    return html.substring(startIndex, pos);
  }
  
  return "";
}


export function getInnerHtml(fullTag: string) {
  const match = fullTag.match(/^<[^>]+>/);
  if (!match) return fullTag;
  const openTagLen = match[0].length;
  // Remove open tag and the last closing tag (heuristic: </tag>)
  // But we don't know the tag name easily unless we parse.
  // Simple heuristic: remove last </...> 
  const lastClose = fullTag.lastIndexOf("</");
  if (lastClose > openTagLen) {
      return fullTag.substring(openTagLen, lastClose);
  }
  return fullTag;
}

export function extractShortDescription(html: string) {
  const candidates = [
    /<(div|p|span)[^>]*class="[^"]*woocommerce-product-details__short-description[^"]*"[^>]*>/i,
    /<(div|p|span)[^>]*class="[^"]*short-description[^"]*"[^>]*>/i,
    /<(div|p|span)[^>]*class="[^"]*product-short-description[^"]*"[^>]*>/i
  ];
  for (const re of candidates) {
    const out = extractOuterHtml(html, re);
    if (out) return getInnerHtml(out);
  }
  return "";
}

export function extractTabsContent(html: string) {
  const result = {
    description: "",
    additional_information: "",
    reviews: ""
  };

  // Extract Description Tab
  // Try ID first
  let descOut = extractOuterHtml(html, /<div[^>]*id="tab-description"[^>]*>/i);
  if (!descOut) {
    // Try class
    descOut = extractOuterHtml(html, /<div[^>]*class="[^"]*woocommerce-Tabs-panel--description[^"]*"[^>]*>/i);
  }
  if (descOut) result.description = getInnerHtml(descOut);

  // Extract Additional Information Tab
  let infoOut = extractOuterHtml(html, /<div[^>]*id="tab-additional_information"[^>]*>/i);
  if (!infoOut) {
    infoOut = extractOuterHtml(html, /<div[^>]*class="[^"]*woocommerce-Tabs-panel--additional_information[^"]*"[^>]*>/i);
  }
  if (infoOut) result.additional_information = getInnerHtml(infoOut);

  return result;
}

export function extractProductTitle(html: string) {
  const candidates = [
    /<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>/i,
    /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>/i,
    /<h1[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>/i,
    /<h1[^>]*>[^<]*<\/h1>/i
  ];
  for (const re of candidates) {
    const out = extractOuterHtml(html, re);
    if (out) return htmlUnescape(getInnerHtml(out)).trim();
  }
  return "";
}

export function extractDescriptionHtml(html: string) {
  // Try tabs first
  const tabs = extractTabsContent(html);
  if (tabs.description) return tabs.description;

  // Fallback to generic content
  const candidates = [
    /<div[^>]*class="[^"]*elementor-widget-theme-post-content[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*elementor-widget-text-editor[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*woocommerce-Tabs-panel[^"]*description[^"]*"[^>]*>/i,
  ];
  for (const re of candidates) {
    const out = extractOuterHtml(html, re);
    if (out) return out;
  }
  return "";
}

export function extractGalleryImages(html: string) {
  const out: string[] = [];
  const figRe = /<(figure|div)[^>]*class="[^"]*woocommerce-product-gallery__image[^"]*"[\s\S]*?<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = figRe.exec(html))) {
    const block = m[0];
    const href = block.match(/href="([^"]+)"/i)?.[1];
    const img = block.match(/src="([^"]+)"/i)?.[1];
    const srcset = block.match(/srcset="([^"]+)"/i)?.[1];
    const thumbSrcset = block.match(/data-thumb-srcset="([^"]+)"/i)?.[1];
    const dataSrc = block.match(/data-src="([^"]+)"/i)?.[1];
    const large = block.match(/data-large_image="([^"]+)"/i)?.[1];
    
    let bestFromSrcset = srcset ? pickLargestFromSrcset(srcset) : undefined;
    if (!bestFromSrcset && thumbSrcset) {
        bestFromSrcset = pickLargestFromSrcset(thumbSrcset);
    }
    
    const src = href || bestFromSrcset || dataSrc || large || img;
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

export function normalizeSku(raw?: string) {
  if (!raw) return undefined;
  let s = String(raw).trim();
  s = s.replace(/^sku\s*[:：\-–]?\s*/i, "");
  s = s.trim();
  const m = s.match(/[A-Za-z0-9][A-Za-z0-9\-_.]*/);
  return m ? m[0] : (s || undefined);
}

function stripSize(u: string) {
  try { const p = new URL(u); p.pathname = p.pathname.replace(/-\d+x\d+(?=\.[a-zA-Z0-9]+$)/, ""); return p.toString(); } catch { return u; }
}

function likelyProductImage(u: string) {
  const s = u.toLowerCase();
  if (/\.(svg)$/i.test(s)) return false;
  if (/(icon|logo|favicon|avatar|placeholder|banner|badge)/i.test(s)) return false;
  if (/(\/wp-content\/themes|\/wp-includes)/i.test(s)) return false;
  if (/(data:image)/i.test(s)) return false;
  if (/(pixel|tracker)/i.test(s)) return false;
  if (/(woocommerce-product|wp-content\/uploads|\/uploads\/|\/product)/i.test(s)) return true;
  return true;
}

export function selectImages(ld: unknown, gallery: string[]) {
  const rawLd = ld && typeof ld === "object" && (ld as Record<string, unknown>).image;
  const arrLd = Array.isArray(rawLd) ? rawLd as unknown[] : (typeof rawLd === "string" ? [rawLd] : []);
  const fromLd = Array.from(new Set(arrLd.map((x) => stripSize(String(x))))).filter(Boolean).filter(likelyProductImage);
  const fromGallery = Array.from(new Set(gallery.map((x) => stripSize(String(x))))).filter(Boolean).filter(likelyProductImage);
  const base = fromLd.length ? fromLd : fromGallery;
  const preferred = base.filter((u) => /\.(jpe?g|webp|png|avif|gif|bmp|tiff)$/i.test(u));
  const primary = preferred.length ? preferred : base;
  const uniq = Array.from(new Set(primary));
  if (!uniq.length) {
    const fallback = Array.from(new Set(gallery.map((x) => stripSize(String(x))))).filter(Boolean);
    return fallback;
  }
  return uniq;
}

function ensureCompatibleImageUrl(url: string) {
  // Proxy AVIF/BMP/TIFF images through images.weserv.nl to convert to JPG
  // because many WooCommerce sites do not support these formats natively.
  // We use images.weserv.nl (full domain) and ensure a .jpg path to satisfy file type checks.
  if (/\.(avif|bmp|tiff)$/i.test(url)) {
      const filename = url.split('/').pop()?.split('?')[0] || 'image.avif';
      const newFilename = filename.replace(/\.[^.]+$/, '.jpg');
      // We use images.weserv.nl and append the filename to the path (e.g. /image.jpg) 
      // to help WooCommerce detect the correct file extension.
      return `https://images.weserv.nl/${newFilename}?url=${encodeURIComponent(url)}&output=jpg`;
   }
  return url;
}

export function buildWpPayloadFromHtml(html: string, srcUrl: string, finalUrl?: string) {
  const ld = extractJsonLdProduct(html);
  const breadcrumb = extractBreadcrumbCategories(html) || [];
  const posted = extractPostedInCategories(html) || [];
  const cat = ld?.category;
  const fromLd = Array.isArray(cat) ? cat : cat ? [cat] : [];
  const allCats = Array.from(new Set([...(breadcrumb || []), ...(posted || []), ...fromLd].map((x) => String(x).trim()).filter(Boolean)));
  const primaryCat = (breadcrumb && breadcrumb.length) ? String(breadcrumb[breadcrumb.length - 1]) : "";
  const orderedCats: string[] = [];
  if (primaryCat) orderedCats.push(primaryCat);
  for (const c of allCats) {
    const lc = c.toLowerCase();
    if (!orderedCats.some((x) => x.toLowerCase() === lc)) orderedCats.push(c);
  }
  let finalCats = orderedCats.filter((c, i) => {
    const lc = c.toLowerCase();
    if (lc === "uncategorized" || lc === "未分类") return false;
    if (lc === "accessories" && i > 0) return false;
    return true;
  });
  if (!finalCats.length) {
    try {
      const u = new URL(finalUrl || srcUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      const iProd = parts.findIndex((p) => p.toLowerCase() === 'product');
      if (iProd >= 0 && parts[iProd + 1]) {
        const seg = parts[iProd + 1];
        const name = seg.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (name && !/^(accessories|uncategorized|未分类)$/i.test(name)) finalCats = [name];
      }
    } catch {}
  }
  const tags = extractTags(html) || [];
  const slug = normalizeWpSlugOrLink(srcUrl);
  const sku = normalizeSku(extractSku(html) || ld?.sku || slug) || slug;
  
  const titleHtml = extractProductTitle(html);
  // Prefer HTML title over LD title because LD title might be "Product Name - Site Name" (WebPage schema)
  const name = titleHtml || ld?.name || slug;

  let images = extractGalleryImages(html);
  if (!images.length) {
    const ogs = extractOgImages(html);
    const contents = extractContentImages(html);
    images = Array.from(new Set([...(ogs || []), ...(contents || [])]));
  }
  const descHtml = extractDescriptionHtml(html);
  const shortDescHtml = extractShortDescription(html);
  const chosen = selectImages(ld, images);
  const abs = chosen.map((u) => new URL(u, finalUrl || srcUrl).toString());
  const maxImages = parseInt(process.env.RUNNER_MAX_IMAGES_PER_PRODUCT || "10", 10) || 10;
  const v = buildWpVariationsFromHtml(html);
  
  // Prefer attributes from tab if available
  const tabs = extractTabsContent(html);
  const additionalAttrs = extractAdditionalAttributes(tabs.additional_information || html);

  const mergedAttributes = [...(v.attributes || [])];
  for (const a of additionalAttrs) {
    const nameLower = a.name.toLowerCase();
    const exists = mergedAttributes.some(ex => {
       const n = ex.name.toLowerCase();
       const norm = normalizeAttrName(ex.name).toLowerCase();
       return n === nameLower || norm === nameLower;
    });
    if (!exists) {
      mergedAttributes.push({
        name: a.name,
        visible: true,
        variation: false,
        options: a.options
      });
    }
  }

  let finalDesc = descHtml;
  // If short description is found inside the main description container (e.g. inside .entry-content), remove it to avoid duplication
  if (shortDescHtml && finalDesc.includes(shortDescHtml)) {
    finalDesc = finalDesc.replace(shortDescHtml, "");
  }

  // If we found additional attributes in the tab, we might not want to append them if they are already displayed in the tab on the target site.
  // However, to preserve data, we append them as a table if they were extracted.
  if (additionalAttrs.length > 0) {
    const rows = additionalAttrs.map(a => `<tr><th>${a.name}</th><td>${a.options.join(", ")}</td></tr>`).join("");
    finalDesc += `<br/><h3>Additional Information</h3><table class="woocommerce-product-attributes shop_attributes">${rows}</table>`;
  }

  const prices = extractProductPrices(html);

  const payload = {
    name: name,
    slug,
    sku,
    description: finalDesc,
    short_description: shortDescHtml ? shortDescHtml.trim() : "",
    regular_price: prices.regular_price,
    sale_price: prices.sale_price,
    type: (v.isRealVariable && v.variations && v.variations.length > 0) ? "variable" : "simple",
    attributes: mergedAttributes.length ? mergedAttributes : undefined,
    default_attributes: v.default_attributes?.length ? v.default_attributes : undefined,
    images: Array.from(new Set(abs)).slice(0, maxImages).map((src) => ({ src: ensureCompatibleImageUrl(src) }))
  };
  const result = { source: "wordpress", url: (finalUrl || srcUrl), slug, sku, name: payload.name, description: payload.description, short_description: payload.short_description, imagesAbs: Array.from(new Set(abs)), catNames: finalCats, tagNames: tags, payload, variations: v.variations };
  return result;
}

export function buildWpVariationsFromHtml(html: string) {
  let vars = extractProductVariations(html);
  const isRealVariable = vars.length > 0;
  if (!vars.length) {
    const attrs = extractFormAttributes(html);
    const prices = extractProductPrices(html);
    vars = buildVariationsFromForm(attrs, prices.regular_price);
  }
  const names = Array.from(new Set(vars.flatMap((v) => Object.keys(v.attributes || {}))));
  const attributes = names.map((n) => {
    const options = Array.from(new Set(vars.map((v) => String(v.attributes?.[n] || "")).filter(Boolean)));
    return { name: n, visible: true, variation: true, options };
  }).filter((a) => a.options.length);
  const first = vars[0];
  const default_attributes = first ? Object.entries(first.attributes || {}).map(([name, option]) => ({ name, option: String(option || "") })).filter((x) => x.option) : [];
  const variations = vars.map((v) => {
    const attrs = Object.entries(v.attributes || {}).map(([name, option]) => ({ name, option: String(option || "") })).filter((x) => x.option);
    const price = v.regular_price ? String(v.regular_price) : undefined;
    const sale_price = v.sale_price ? String(v.sale_price) : undefined;
    const imgSrc = v.image?.src;
    const image = imgSrc ? { src: cleanImageUrl(String(imgSrc)) || String(imgSrc) } : undefined;
    const out: Record<string, unknown> = { attributes: attrs };
    if (price) out.regular_price = price;
    if (sale_price) out.sale_price = sale_price;
    if (image?.src) out.image = image;
    return out;
  });
  return { attributes, default_attributes, variations, isRealVariable };
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
    const cleaned = b
      .replace(/<(section|div)[^>]*class="[^"]*(related|upsells|cross-sells)[^"]*"[\s\S]*?<\/\1>/gi, '')
      .replace(/<a[^>]*class="[^"]*(woocommerce-LoopProduct-link|woocommerce-LoopProduct__link)[^"]*"[\s\S]*?<\/a>/gi, '')
      .replace(/<div[^>]*class="[^"]*(products|product-grid|products-carousel)[^"]*"[\s\S]*?<\/div>/gi, '');
    const imgRe = /<img[^>]+(srcset|data-src|src)="([^"]+)"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(cleaned))) {
      const attr = m[1];
      const val = m[2];
      // 排除缩略图占位符
      const skip = /(woocommerce-placeholder|attachment-woocommerce_thumbnail|thumbnail)/i.test(m[0]);
      if (skip) continue;
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
