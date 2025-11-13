(() => {
  const BASE_URL = "https://shopify2woo-n4k1mvrhg-kejieleungs-projects.vercel.app";
  const frame = document.getElementById("contentFrame");
  const setFrame = (path = "/") => {
    if (frame && frame instanceof HTMLIFrameElement) {
      frame.src = `${BASE_URL}${path}`;
    }
  };

  const open = (path = "/") => chrome.tabs.create({ url: `${BASE_URL}${path}` });

  // 检测当前活动页面是否为 Shopify 商店，并在弹窗内加载相应页面
  let latestDetection = { isShopify: false, origin: "" };
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    let origin = "";
    let isShopify = false;
    try {
      origin = new URL(tab.url || "").origin;
    } catch {}
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const is = Boolean(
            // 典型标识：window.Shopify 或域名包含 myshopify
            (window /** @type {any} */).Shopify ||
            location.hostname.endsWith("myshopify.com") ||
            document.querySelector('meta[name="shopify-digital-wallet"]') ||
            document.querySelector('link[href*="cdn.shopify.com"]')
          );
          return { isShopify: is, origin: location.origin };
        },
      });
      if (result?.origin) origin = result.origin;
      isShopify = Boolean(result?.isShopify);
    } catch (e) {
      // 无法注入脚本时，退化为基于域名的判断
      isShopify = origin.includes("myshopify.com");
    }

    latestDetection = { isShopify, origin };
    if (isShopify && origin) {
      console.log("Shopify2Woo: 检测到 Shopify 商店", origin);
      setFrame(`/import?shopifyUrl=${encodeURIComponent(origin)}&isShopify=1`);
    } else {
      console.log("Shopify2Woo: 当前页面非 Shopify 商店，未自动填充");
      setFrame(`/import?isShopify=0`);
    }
  });

  // Toolbar actions（在弹窗内加载而不是跳转）
  document.getElementById("home")?.addEventListener("click", () => {
    const path = latestDetection.isShopify && latestDetection.origin
      ? `/import?shopifyUrl=${encodeURIComponent(latestDetection.origin)}&isShopify=1`
      : `/import?isShopify=0`;
    setFrame(path);
  });
  document.getElementById("guide")?.addEventListener("click", () => {
    // 功能引导：在弹窗内展示 import 页并提示说明
    const path = latestDetection.isShopify && latestDetection.origin
      ? `/import?shopifyUrl=${encodeURIComponent(latestDetection.origin)}&isShopify=1`
      : `/import?isShopify=0`;
    setFrame(path);
    setTimeout(() => {
      alert("功能引导：\n1）在 /config 配置 Woo API\n2）到 /import 批量导入 Shopify 商品\n3）支持图片上传与关键词搜索");
    }, 200);
  });
  document.getElementById("settings")?.addEventListener("click", () => setFrame("/config"));
  document.getElementById("help")?.addEventListener("click", () => {
    alert("帮助：如遇问题，可在页面右上角查看使用说明或联系维护者。");
  });

  // Main actions
  document.getElementById("quickShot")?.addEventListener("click", async () => {
    try {
      // 仅做演示：截屏后打开导入页。若要自动上传需与站点约定接口。
      const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: "png" });
      // 保留截图到新标签便于用户保存，然后打开导入页
      const blob = await (await fetch(dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url });
      open("/import");
    } catch (e) {
      console.warn("截图失败", e);
      open("/import");
    }
  });

  document.getElementById("upload")?.addEventListener("click", () => open("/import"));
  document.getElementById("keyword")?.addEventListener("click", () => open("/import"));

  // Orders grid
  document.querySelectorAll(".order-item").forEach((el) => {
    el.addEventListener("click", () => open("/"));
  });
})();