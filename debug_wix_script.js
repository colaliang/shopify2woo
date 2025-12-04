/* eslint-disable */

const fs = require('fs');

const defaultHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.8,zh-CN;q=0.7,zh;q=0.6",
};

async function run() {
    const url = "https://www.everglowlighting.com.au/product-page/aluminum-extrusion-se-a005";
    try {
        const res = await fetch(url, { headers: defaultHeaders });
        if (!res.ok) {
            console.error("Failed to fetch:", res.status);
            return;
        }
        const text = await res.text();
        fs.writeFileSync("debug_wix.html", text);
        console.log("Saved to debug_wix.html");
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
