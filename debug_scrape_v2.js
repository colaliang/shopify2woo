/* eslint-disable */
const fs = require('fs');

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

function extractTabsContent(html) {
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

function extractDescriptionHtml(html) {
  // Try tabs first
  const tabs = extractTabsContent(html);
  if (tabs.description) {
      console.log("Found description in standard tabs");
      return tabs.description;
  }

  // Fallback to generic content
  const candidates = [
    /<div[^>]*class="[^"]*elementor-widget-theme-post-content[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*elementor-widget-text-editor[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*woocommerce-Tabs-panel[^"]*description[^"]*"[^>]*>/i,
  ];
  for (const re of candidates) {
    const out = extractOuterHtml(html, re);
    if (out) {
        console.log("Found description in generic candidates");
        return out;
    }
  }

  // 1. Check for .tab-content if description is still empty
  console.log("Attempting fallback to .tab-content...");
  const tabContentOut = extractOuterHtml(html, /<div[^>]*class="[^"]*tab-content[^"]*"[^>]*>/i);
  if (tabContentOut) {
    console.log("Found .tab-content container");
    let remaining = tabContentOut;
    let merged = "";
    let loopCount = 0;
    while (loopCount < 20) {
      const paneStart = remaining.match(/<div[^>]*class="[^"]*tab-pane[^"]*"[^>]*>/i);
      if (!paneStart) break;
      
      const paneHtml = extractOuterHtml(remaining, /<div[^>]*class="[^"]*tab-pane[^"]*"[^>]*>/i);
      if (!paneHtml) break;

      // Exclude reviews tab
      if (
        !/id="reviews"/i.test(paneStart[0]) && 
        !/id="tab-reviews"/i.test(paneStart[0]) && 
        !/class="[^"]*reviews[^"]*"/i.test(paneStart[0]) &&
        !/id="downloads"/i.test(paneStart[0]) &&
        !/id="tab-downloads"/i.test(paneStart[0])
      ) {
        const inner = getInnerHtml(paneHtml);
        
        const isDownloadTab = /id="[^"]*download[^"]*"/i.test(paneStart[0]) || /class="[^"]*download[^"]*"/i.test(paneStart[0]);
        const startsWithDownloads = /<h[1-6][^>]*>\s*Downloads\s*<\/h[1-6]>/i.test(inner);

        // 2023-12-06: Improved exclusion for tabs that are labeled "Downloads" in the navigation but have generic IDs (like menu2).
        // We try to find the corresponding tab link by ID.
        let isLinkedAsDownloads = false;
        const idMatch = paneStart[0].match(/id="([^"]+)"/i);
        if (idMatch && idMatch[1]) {
            const id = idMatch[1];
            // Look for a link pointing to this ID: href="#id"
            const linkRegex = new RegExp(`<a[^>]*href="#${id}"[^>]*>([\\s\\S]*?)<\\/a>`, 'i');
            const linkMatch = html.match(linkRegex);
            if (linkMatch && linkMatch[1]) {
                if (/Downloads/i.test(linkMatch[1])) {
                    isLinkedAsDownloads = true;
                }
            }
        }

        if (!isDownloadTab && !startsWithDownloads && !isLinkedAsDownloads) {
            if (inner.trim()) {
                console.log(`Merging pane: ${paneStart[0].slice(0, 50)}...`);
                merged += inner + "<br/><br/>";
            }
        } else {
             console.log(`Skipping downloads pane: ${paneStart[0].slice(0, 50)}...`);
        }
      } else {
        console.log(`Skipping reviews/downloads pane: ${paneStart[0].slice(0, 50)}...`);
      }
      
      const idx = remaining.indexOf(paneHtml);
      if (idx === -1) break;
      remaining = remaining.slice(idx + paneHtml.length);
      loopCount++;
    }
    if (merged.trim()) return merged;
  }

  return "";
}

// Read the temp file
try {
    const html = fs.readFileSync('temp_product.html', 'utf8');
    const desc = extractDescriptionHtml(html);
    console.log("\n--- FINAL DESCRIPTION START ---");
    console.log(desc);
    console.log("--- FINAL DESCRIPTION END ---");
} catch (e) {
    console.error("Error:", e);
}
