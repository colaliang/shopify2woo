chrome.action.onClicked.addListener(() => {
  // 生产环境：指向已部署的 Vercel 站点
  const url = "https://shopify2woo-n4k1mvrhg-kejieleungs-projects.vercel.app";
  chrome.tabs.create({ url });
});