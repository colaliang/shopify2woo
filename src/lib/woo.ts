// Woo 客户端说明（代理与鉴权详解）
//
// 1) 鉴权方式：使用查询参数 consumer_key/consumer_secret 进行 Woo REST API 访问。
//    - 适用于大多数启用 Woo REST API 的站点，无需在请求头中暴露密钥。
//    - 如果站点前面有反向代理（如 Nginx/Cloudflare）并屏蔽了查询参数鉴权，需改用 Basic Auth 或 JWT；本模块暂不支持这两种方式，后续可扩展。
//
// 2) 代理支持：
//    - 本模块支持通过环境变量 `HTTP_PROXY` 或 `HTTPS_PROXY` 启用网络代理（当运行在 Node/服务器端时）。
//    - 代理由 undici 的 ProxyAgent 提供，通过 fetch 的 `dispatcher` 选项启用；如果在浏览器环境或代理不可用，本功能自动忽略。
//    - 示例：在本地或服务器上设置 `HTTP_PROXY=http://127.0.0.1:7890`，请求将经由该代理转发。
//
// 3) 重试与限流：
//    - 当出现 5xx 或 429（限流）时，进行线性回退重试（1s, 2s, ...）。
//    - 可根据业务需求调整最大重试次数与等待策略。
//
// 4) 常见问题：
//    - Cloudflare/WAF：可能对含密钥的查询参数敏感，需在站点侧放行 Woo API 路径 `wp-json/wc/v3/*`。
//    - 站点 URL：使用站点根域名，如 `https://example.com/`，不要包含 `/wp-admin` 或子路径。
//    - 响应格式：Woo REST API 返回 JSON；部分站点可能返回 HTML 错误页，需要在调用处做异常兜底与日志记录。
//
// 5) 安全建议：
//    - 优先在服务端保存和使用密钥（如 Supabase），前端仅触发后端调用，避免泄露。
//    - 若必须使用代理，请确保代理信道可信，避免中间人攻击。

type WooConfig = {
  url: string;
  consumerKey: string;
  consumerSecret: string;
};

// 可选代理：从环境变量生成 undici 的 ProxyAgent
let ProxyAgentRef: (new (proxy: string) => unknown) | null = null;
try {
  // 动态引入，避免在浏览器端/边缘环境报错
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const undici = require("undici");
  ProxyAgentRef = undici?.ProxyAgent || null;
} catch {}

function getDispatcherFromEnv() {
  try {
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (ProxyAgentRef && proxy) {
      return new ProxyAgentRef(proxy);
    }
  } catch {}
  return undefined;
}

// 核心请求：统一处理鉴权、重试与可选代理
async function wooFetch(
  cfg: WooConfig,
  endpoint: string,
  init?: RequestInit,
  retry = 2
) {
  const url = new URL(endpoint, cfg.url.replace(/\/$/, ""));
  url.searchParams.set("consumer_key", cfg.consumerKey);
  url.searchParams.set("consumer_secret", cfg.consumerSecret);
  const dispatcher = getDispatcherFromEnv();
  for (let i = 0; i <= retry; i++) {
    type UndiciRequestInit = RequestInit & { dispatcher?: unknown };
    const res = await fetch(url.toString(), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      // `dispatcher` 为 undici 的扩展选项，这里做类型兼容处理
      ...(dispatcher ? ({ dispatcher } as UndiciRequestInit) : {}),
    });
    if (res.status >= 500 || res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      continue;
    }
    return res;
  }
  throw new Error("Woo 请求重试后仍失败");
}

export async function wooGet(cfg: WooConfig, endpoint: string) {
  return wooFetch(cfg, endpoint, { method: "GET" });
}

export async function wooPost(cfg: WooConfig, endpoint: string, body: unknown) {
  return wooFetch(cfg, endpoint, { method: "POST", body: JSON.stringify(body) });
}

export async function wooPut(cfg: WooConfig, endpoint: string, body: unknown) {
  return wooFetch(cfg, endpoint, { method: "PUT", body: JSON.stringify(body) });
}

export async function ensureTerms(
  cfg: WooConfig,
  kind: "category" | "tag",
  names: string[]
) {
  const result: { id: number }[] = [];
  const endpoint = kind === "category" ? "wp-json/wc/v3/products/categories" : "wp-json/wc/v3/products/tags";
  for (const nm of names) {
    const nameStr = String(nm || "").trim();
    if (!nameStr) continue;
    const q = await (await wooGet(cfg, `${endpoint}?search=${encodeURIComponent(nameStr)}`)).json();
    type WooTerm = { id?: number; name?: string };
    let found = Array.isArray(q)
      ? q.find((t: WooTerm) => String(t?.name || "").trim().toLowerCase() === nameStr.toLowerCase())
      : null;
    if (!found) {
      found = await (await wooPost(cfg, endpoint, { name: nameStr })).json();
    }
    const id = found?.id;
    if (typeof id === "number") result.push({ id });
  }
  return result;
}

export async function findProductBySkuOrSlug(cfg: WooConfig, sku?: string, slug?: string) {
  let res;
  if (sku) {
    res = await wooGet(cfg, `wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`);
  } else if (slug) {
    res = await wooGet(cfg, `wp-json/wc/v3/products?slug=${encodeURIComponent(slug)}`);
  }
  const arr = (await res?.json()) || [];
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}