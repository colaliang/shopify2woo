import { fetchHtml } from "./wordpressScrape";

function extractHandlesFromXml(xml: string) {
  const locs = Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)).map((m) => m[1].trim());
  const handles = locs
    .filter((u) => /\/products\//i.test(u))
    .map((u) => {
      try {
        const p = new URL(u);
        const m = p.pathname.match(/\/products\/([^\/?#]+)/);
        return m ? m[1] : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as string[];
  return Array.from(new Set(handles));
}

function extractHandlesFromHtml(base: string, html: string) {
  const out: string[] = [];
  const re = /<a[^>]*href="([^"]+)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (/\/products\//i.test(href)) {
      try {
        const u = new URL(href, base);
        const mm = u.pathname.match(/\/products\/([^\/?#]+)/);
        if (mm && mm[1]) out.push(mm[1]);
      } catch {}
    }
  }
  return Array.from(new Set(out));
}

export async function discoverShopifyHandles(base: string, cap = 1000) {
  const candidates = ["/sitemap.xml", "/sitemap_index.xml", "/collections/all", "/products"];
  const handles: string[] = [];
  for (const p of candidates) {
    try {
      const url = new URL(p, base.replace(/\/$/, "")).toString();
      const html = await fetchHtml(url);
      if (/^<\?xml/.test(html)) {
        extractHandlesFromXml(html).forEach((h) => handles.push(h));
      } else {
        extractHandlesFromHtml(base, html).forEach((h) => handles.push(h));
      }
    } catch {}
    if (handles.length >= cap) break;
  }
  return Array.from(new Set(handles)).slice(0, cap);
}

