const fs = require('fs');

// Mocking the logic I want to test
function extractOuterHtml(html, startRegex) {
  const m = html.match(startRegex);
  if (!m || m.index === undefined) return "";
  const startIndex = m.index;
  const openTag = m[0];
  const openTagEnd = startIndex + openTag.length;
  const tagMatch = openTag.match(/^<([a-z0-9]+)/i);
  const tagName = tagMatch ? tagMatch[1].toLowerCase() : "div";
  let balance = 1;
  let pos = openTagEnd;
  while (balance > 0 && pos < html.length) {
    const nextOpen = html.indexOf("<" + tagName, pos);
    const nextClose = html.indexOf("</" + tagName + ">", pos);
    if (nextClose === -1) break; 
    if (nextOpen !== -1 && nextOpen < nextClose) {
      balance++;
      pos = nextOpen + tagName.length + 1; 
    } else {
      balance--;
      pos = nextClose + tagName.length + 3; 
    }
  }
  if (balance === 0) return html.substring(startIndex, pos);
  return "";
}

function getInnerHtml(fullTag) {
  const match = fullTag.match(/^<[^>]+>/);
  if (!match) return fullTag;
  const openTagLen = match[0].length;
  const lastClose = fullTag.lastIndexOf("</");
  if (lastClose > openTagLen) return fullTag.substring(openTagLen, lastClose);
  return fullTag;
}

function extractProductTitle(html) {
  const candidates = [
    /<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>/i,
    /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>/i,
    /<h1[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>/i,
  ];
  for (const re of candidates) {
    const out = extractOuterHtml(html, re);
    if (out) return getInnerHtml(out).trim();
  }
  return "";
}

function extractJsonLdProduct(html) {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    try {
      const obj = JSON.parse(raw);
      if (obj["@graph"] && Array.isArray(obj["@graph"])) {
        const graph = obj["@graph"];
        const p = graph.find((x) => x && x["@type"] === "Product");
        if (p) return p;
        const webPage = graph.find((x) => x && (x["@type"] === "WebPage" || x["@type"] === "ItemPage"));
        if (webPage && webPage.name) return webPage;
      }
      const p = Array.isArray(obj) ? obj.find((x) => x && (x["@type"] === "Product" || x.name)) : obj;
      if (p && (p["@type"] === "Product" || p.name)) return p;
    } catch {}
  }
  return null;
}

// I need to recreate the html file since I deleted it.
// I will use a small snippet based on what I know.
const htmlContent = `
<html>
<body>
<h1 class="product_title entry-title elementor-heading-title elementor-size-default">24V DC Ultra-Efficient 2835 LED Strip &#8211; High Density 240LEDs/M 10mm Professional Lighting (22W/M)</h1>
<script type="application/ld+json" class="yoast-schema-graph">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":"https://brt-led.com/product/high-efficiency-240leds-m-2835-smd-24v-10mm-led-strip-light/","url":"https://brt-led.com/product/high-efficiency-240leds-m-2835-smd-24v-10mm-led-strip-light/","name":"24V DC Ultra-Efficient 2835 LED Strip - High Density 240LEDs/M 10mm Professional Lighting (22W/M) | BRT LED"}]}</script>
</body>
</html>
`;

console.log("--- Title ---");
console.log(extractProductTitle(htmlContent));

console.log("--- JSON LD ---");
const ld = extractJsonLdProduct(htmlContent);
console.log(ld ? ld.name : "Null");

