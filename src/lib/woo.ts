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
//    - Cloudflare/WAF：可能对含密钥的查询参数敏感，需在站点侧放行 Woo API 路径 `index.php/wp-json/wc/v3/*`。
//    - 站点 URL：使用站点根域名，如 `https://example.com/`，不要包含 `/wp-admin` 或子路径。
//    - 响应格式：Woo REST API 返回 JSON；部分站点可能返回 HTML 错误页，需要在调用处做异常兜底与日志记录。
//
// 5) 安全建议：
//    - 优先在服务端保存和使用密钥（如 Supabase），前端仅触发后端调用，避免泄露。
//    - 若必须使用代理，请确保代理信道可信，避免中间人攻击。

export type WooConfig = {
  url: string;
  consumerKey: string;
  consumerSecret: string;
};

function redact(url: string) {
  try {
    const u = new URL(url);
    if (u.searchParams.has("consumer_key")) u.searchParams.set("consumer_key", "***");
    if (u.searchParams.has("consumer_secret")) u.searchParams.set("consumer_secret", "***");
    return u.toString();
  } catch {
    return url;
  }
}

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
  init?: RequestInit & { retries?: number },
  retry = 2
) {
  function applyIndexPhp(ep: string) {
    const clean = ep.replace(/^\//, "");
    if (clean.startsWith("index.php/")) return clean;
    if (clean.startsWith("wp-json/")) return `index.php/${clean}`;
    return ep;
  }
  const url = new URL(applyIndexPhp(endpoint), cfg.url.replace(/\/$/, ""));
  const logCtx = (init as unknown as { __logCtx?: LogCtx })?.__logCtx || defaultLogCtx;
  const dispatcher = getDispatcherFromEnv();
  const started = Date.now();
  const method = (init?.method || "GET").toUpperCase();
  const maxRetry = init?.retries !== undefined 
    ? init.retries 
    : (method !== "GET"
      ? (parseInt(process.env.WOO_WRITE_RETRY || "3", 10) || 3)
      : (parseInt(process.env.WOO_READ_RETRY || String(retry), 10) || retry));
  for (let i = 0; i <= maxRetry; i++) {
    const authMode = (process.env.WOO_AUTH_MODE || "query").toLowerCase();
    const apiUrl = new URL(url.toString());
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(init?.headers || {}) as Record<string, string>,
    };
    if (authMode === "basic") {
      const token = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
      headers["Authorization"] = `Basic ${token}`;
    } else {
      apiUrl.searchParams.set("consumer_key", cfg.consumerKey);
      apiUrl.searchParams.set("consumer_secret", cfg.consumerSecret);
    }
    if (logCtx?.userId && logCtx?.requestId) {
      try {
        const { appendLog } = await import("./logs");
        await appendLog(logCtx.userId, logCtx.requestId, "info", `resolved ${authMode} ${redact(apiUrl.toString())}`);
      } catch {}
    }
    
    // 详细的请求日志记录
    try {
      const requestLogData = {
        ts: new Date().toISOString(),
        level: "INFO",
        event: "wp_request_start",
        method: init?.method || "GET",
        url: redact(apiUrl.toString()),
        retryAttempt: i,
        bodySize: init?.body ? String(init.body).length : 0,
        hasDispatcher: !!dispatcher,
        authMode,
        endpointResolved: apiUrl.pathname
      };
      console.log(JSON.stringify(requestLogData));
      if (logCtx?.userId && logCtx?.requestId) {
        const { appendLog } = await import("./logs");
        await appendLog(logCtx.userId, logCtx.requestId, "info", `wp_request_start method=${init?.method || "GET"} url=${redact(apiUrl.toString())} retry=${i}`);
      }
    } catch (logError) {
      console.error(`请求日志记录失败: ${logError}`);
    }
    
    const timeoutMs = method !== "GET"
      ? (parseInt(process.env.WOO_WRITE_TIMEOUT_MS || "40000", 10) || 40000)
      : (parseInt(process.env.WOO_FETCH_TIMEOUT_MS || "20000", 10) || 20000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    type UndiciRequestInit = RequestInit & { dispatcher?: unknown };
    let res: Response;
    try {
      res = await fetch(apiUrl.toString(), {
        ...init,
        headers,
        ...(dispatcher ? ({ dispatcher } as UndiciRequestInit) : {}),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      try {
        const errorLogData = {
          ts: new Date().toISOString(),
          level: "ERROR",
          event: "wp_request_network_error",
          method: init?.method || "GET",
          url: redact(apiUrl.toString()),
          retryAttempt: i,
          error: (err as Error)?.message || String(err),
        };
        console.error(JSON.stringify(errorLogData));
        if (logCtx?.userId && logCtx?.requestId) {
          const { appendLog } = await import("./logs");
          await appendLog(logCtx.userId, logCtx.requestId, "error", `wp_request_network_error method=${init?.method || "GET"} url=${redact(apiUrl.toString())} retry=${i} err=${(err as Error)?.message || String(err)}`);
        }
      } catch {}
      if (i < maxRetry) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
    clearTimeout(timer);
    const ct = res.headers.get("content-type") || "";
    const ms = Date.now() - started;
    
    // 详细的响应日志记录
    try {
      const logData = {
        ts: new Date().toISOString(),
        level: res.ok ? "INFO" : "ERROR",
        event: res.ok ? "wp_response" : "wp_response_error",
        method: init?.method || "GET",
        url: redact(apiUrl.toString()), // 使用实际的请求URL（包含认证参数）
        status: res.status,
        contentType: ct,
        responseTimeMs: ms,
        retryAttempt: i
      };
      
      if (!res.ok || ((init?.method || "GET") !== "GET" && !ct.includes("application/json"))) {
        const body = await res.clone().text().catch(() => "");
        const errorLogData = {
          ...logData,
          bodyPreview: body.slice(0, 500),
          bodyLength: body.length
        };
        console.error(JSON.stringify(errorLogData));
        if (logCtx?.userId && logCtx?.requestId) {
          const { appendLog } = await import("./logs");
          await appendLog(logCtx.userId, logCtx.requestId, "error", `wp_response_error method=${init?.method || "GET"} status=${res.status} ct=${ct} url=${redact(apiUrl.toString())} retry=${i} preview=${errorLogData.bodyPreview}`);
        }
      } else {
        console.log(JSON.stringify(logData));
        if (logCtx?.userId && logCtx?.requestId) {
          const { appendLog } = await import("./logs");
          await appendLog(logCtx.userId, logCtx.requestId, "info", `wp_response method=${init?.method || "GET"} status=${res.status} ct=${ct} url=${redact(apiUrl.toString())} retry=${i}`);
        }
        
        // 对于成功的响应，也记录响应体信息（调试用）
        if (process.env.DEBUG_WOO_RESPONSE === "1") {
          const body = await res.clone().text().catch(() => "");
          const debugLogData = {
            ...logData,
            bodyPreview: body.slice(0, 200),
            bodyLength: body.length
          };
          console.log(JSON.stringify(debugLogData));
        }
      }
    } catch (logError) {
      // 日志记录失败时不中断主流程
      console.error(`日志记录失败: ${logError}`);
    }
    if (!res.ok || ((init?.method || "GET") !== "GET" && !ct.includes("application/json"))) {
      if (i < maxRetry) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw new Error(`Woo 请求失败: 状态=${res.status} CT=${ct}`);
    }
    if (res.status >= 500 || res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      continue;
    }
    return res;
  }
  throw new Error("Woo 请求重试后仍失败");
}

export async function wooGet(cfg: WooConfig, endpoint: string, logContext?: { userId?: string; requestId?: string; productHandle?: string }) {
  return wooFetch(cfg, endpoint, { method: "GET", ...(logContext ? { __logCtx: { userId: logContext.userId, requestId: logContext.requestId, productHandle: logContext.productHandle } } : {}) } as unknown as RequestInit);
}

export async function wooPost(cfg: WooConfig, endpoint: string, body: unknown, logContext?: { userId?: string; requestId?: string; productHandle?: string }, options?: { retries?: number }) {
  let payload = "";
  try { 
    payload = JSON.stringify(body); 
    if (logContext?.userId && logContext?.requestId) {
      try { 
        const { appendLog } = await import('./logs');
        await appendLog(logContext.userId, logContext.requestId, "info", 
          `WooCommerce POST请求预处理完成 endpoint=${endpoint} handle=${logContext.productHandle || ""} 数据大小=${payload.length}`);
      } catch {}
    }
  } catch (e) { 
    payload = String(body || ""); 
    if (logContext?.userId && logContext?.requestId) {
      try { 
        const { appendLog } = await import('./logs');
        await appendLog(logContext.userId, logContext.requestId, "error", 
          `WooCommerce POST请求JSON序列化失败 endpoint=${endpoint} handle=${logContext.productHandle || ""} 错误=${String(e)}`);
      } catch {}
    }
  }
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "INFO", event: "wp_request", method: "POST", endpoint, bodySize: payload.length })); } catch {}
  return wooFetch(cfg, endpoint, { 
    method: "POST", 
    body: payload, 
    ...(logContext ? { __logCtx: { userId: logContext.userId, requestId: logContext.requestId, productHandle: logContext.productHandle } } : {}),
    ...(options?.retries !== undefined ? { retries: options.retries } : {})
  } as unknown as RequestInit);
}

export async function wooPut(cfg: WooConfig, endpoint: string, body: unknown, logContext?: { userId?: string; requestId?: string; productHandle?: string }, options?: { retries?: number }) {
  let payload = "";
  try { 
    payload = JSON.stringify(body); 
    if (logContext?.userId && logContext?.requestId) {
      try { 
        const { appendLog } = await import('./logs');
        await appendLog(logContext.userId, logContext.requestId, "info", 
          `WooCommerce PUT请求预处理完成 endpoint=${endpoint} handle=${logContext.productHandle || ""} 数据大小=${payload.length}`);
      } catch {}
    }
  } catch (e) { 
    payload = String(body || ""); 
    if (logContext?.userId && logContext?.requestId) {
      try { 
        const { appendLog } = await import('./logs');
        await appendLog(logContext.userId, logContext.requestId, "error", 
          `WooCommerce PUT请求JSON序列化失败 endpoint=${endpoint} handle=${logContext.productHandle || ""} 错误=${String(e)}`);
      } catch {}
    }
  }
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "INFO", event: "wp_request", method: "PUT", endpoint, bodySize: payload.length })); } catch {}
  return wooFetch(cfg, endpoint, { 
    method: "PUT", 
    body: payload, 
    ...(logContext ? { __logCtx: { userId: logContext.userId, requestId: logContext.requestId, productHandle: logContext.productHandle } } : {}),
    ...(options?.retries !== undefined ? { retries: options.retries } : {})
  } as unknown as RequestInit);
}

export async function wooDelete(cfg: WooConfig, endpoint: string, logContext?: { userId?: string; requestId?: string; productHandle?: string }, options?: { retries?: number }) {
  if (logContext?.userId && logContext?.requestId) {
    try { 
      const { appendLog } = await import('./logs');
      await appendLog(logContext.userId, logContext.requestId, "info", 
        `WooCommerce DELETE请求 endpoint=${endpoint} handle=${logContext.productHandle || ""}`);
    } catch {}
  }
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "INFO", event: "wp_request", method: "DELETE", endpoint })); } catch {}
  return wooFetch(cfg, endpoint, { 
    method: "DELETE", 
    ...(logContext ? { __logCtx: { userId: logContext.userId, requestId: logContext.requestId, productHandle: logContext.productHandle } } : {}),
    ...(options?.retries !== undefined ? { retries: options.retries } : {})
  } as unknown as RequestInit);
}

export async function ensureTerms(
  cfg: WooConfig,
  kind: "category" | "tag",
  names: string[],
  logContext?: { userId?: string; requestId?: string; productHandle?: string }
) {
  const result: { id: number }[] = [];
  const endpoint = kind === "category" ? "index.php/wp-json/wc/v3/products/categories" : "index.php/wp-json/wc/v3/products/tags";
  const kindName = kind === "category" ? "分类" : "标签";
  
  if (logContext?.userId && logContext?.requestId) {
    try { 
      const { appendLog } = await import('./logs');
      await appendLog(logContext.userId, logContext.requestId, "info", 
        `开始处理${kindName}术语 names=${JSON.stringify(names)} handle=${logContext.productHandle || ""}`);
    } catch {}
  }
  
  for (const nm of names) {
    const nameStr = String(nm || "").trim();
    if (!nameStr) continue;
    
    try {
      const searchResponse = await wooGet(cfg, `${endpoint}?search=${encodeURIComponent(nameStr)}`, logContext);
      if (!searchResponse.ok) {
        if (logContext?.userId && logContext?.requestId) {
          try { 
            const { appendLog } = await import('./logs');
            await appendLog(logContext.userId, logContext.requestId, "error", 
              `${kindName}搜索请求失败 name=${nameStr} handle=${logContext.productHandle || ""} 状态=${searchResponse.status}`);
          } catch {}
        }
        const createResponse = await wooPost(cfg, endpoint, { name: nameStr }, logContext);
        if (!createResponse.ok) {
          if (logContext?.userId && logContext?.requestId) {
            try { 
              const { appendLog } = await import('./logs');
              await appendLog(logContext.userId, logContext.requestId, "error", 
                `${kindName}创建失败 name=${nameStr} handle=${logContext.productHandle || ""} 状态=${createResponse.status}`);
            } catch {}
          }
          continue;
        }
        const created = await createResponse.json();
        const id0 = created?.id;
        if (typeof id0 === "number") {
          result.push({ id: id0 });
          if (logContext?.userId && logContext?.requestId) {
            try { 
              const { appendLog } = await import('./logs');
              await appendLog(logContext.userId, logContext.requestId, "info", 
                `${kindName}处理完成 name=${nameStr} id=${id0} handle=${logContext.productHandle || ""}`);
            } catch {}
          }
        }
        continue;
      }
      
      const q = await searchResponse.json();
      type WooTerm = { id?: number; name?: string };
      let found = Array.isArray(q)
        ? q.find((t: WooTerm) => String(t?.name || "").trim().toLowerCase() === nameStr.toLowerCase())
        : null;
        
      if (!found) {
        if (logContext?.userId && logContext?.requestId) {
          try { 
            const { appendLog } = await import('./logs');
            await appendLog(logContext.userId, logContext.requestId, "info", 
              `创建新${kindName} name=${nameStr} handle=${logContext.productHandle || ""}`);
          } catch {}
        }
        
        const createResponse = await wooPost(cfg, endpoint, { name: nameStr }, logContext);
        if (!createResponse.ok) {
          if (logContext?.userId && logContext?.requestId) {
            try { 
              const { appendLog } = await import('./logs');
              await appendLog(logContext.userId, logContext.requestId, "error", 
                `${kindName}创建失败 name=${nameStr} handle=${logContext.productHandle || ""} 状态=${createResponse.status}`);
            } catch {}
          }
          continue;
        }
        found = await createResponse.json();
      }
      
      const id = found?.id;
      if (typeof id === "number") {
        result.push({ id });
        if (logContext?.userId && logContext?.requestId) {
          try { 
            const { appendLog } = await import('./logs');
            await appendLog(logContext.userId, logContext.requestId, "info", 
              `${kindName}处理完成 name=${nameStr} id=${id} handle=${logContext.productHandle || ""}`);
          } catch {}
        }
      }
    } catch (e) {
      if (logContext?.userId && logContext?.requestId) {
        try { 
          const { appendLog } = await import('./logs');
          await appendLog(logContext.userId, logContext.requestId, "error", 
            `${kindName}处理异常 name=${nameStr} handle=${logContext.productHandle || ""} 错误=${String(e)}`);
        } catch {}
      }
    }
  }
  
  if (logContext?.userId && logContext?.requestId) {
    try { 
      const { appendLog } = await import('./logs');
      await appendLog(logContext.userId, logContext.requestId, "info", 
        `${kindName}处理完成 总数=${result.length} handle=${logContext.productHandle || ""}`);
    } catch {}
  }
  
  return result;
}

export async function findProductBySkuOrSlug(cfg: WooConfig, sku?: string, slug?: string, logContext?: { userId?: string; requestId?: string; productHandle?: string }) {
  let res;
  try {
    if (sku) {
      if (logContext?.userId && logContext?.requestId) {
        try { 
          const { appendLog } = await import('./logs');
          await appendLog(logContext.userId, logContext.requestId, "info", 
            `按SKU查找产品 sku=${sku} handle=${logContext.productHandle || ""}`);
        } catch {}
      }
      res = await wooGet(cfg, `index.php/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`, logContext);
    } else if (slug) {
      if (logContext?.userId && logContext?.requestId) {
        try { 
          const { appendLog } = await import('./logs');
          await appendLog(logContext.userId, logContext.requestId, "info", 
            `按slug查找产品 slug=${slug} handle=${logContext.productHandle || ""}`);
        } catch {}
      }
      res = await wooGet(cfg, `index.php/wp-json/wc/v3/products?slug=${encodeURIComponent(slug)}`, logContext);
    }
    
    if (!res || !res.ok) {
      if (logContext?.userId && logContext?.requestId) {
        try { 
          const { appendLog } = await import('./logs');
          await appendLog(logContext.userId, logContext.requestId, "error", 
            `产品查找请求失败 sku=${sku || ""} slug=${slug || ""} handle=${logContext.productHandle || ""} 状态=${res?.status || "无响应"}`);
        } catch {}
      }
      return null;
    }
    
    const arr = (await res.json()) || [];
    const result = Array.isArray(arr) && arr.length ? arr[0] : null;
    
    if (logContext?.userId && logContext?.requestId) {
      try { 
        const { appendLog } = await import('./logs');
        await appendLog(logContext.userId, logContext.requestId, "info", 
          `产品查找完成 sku=${sku || ""} slug=${slug || ""} handle=${logContext.productHandle || ""} 结果=${result ? "找到" : "未找到"}`);
      } catch {}
    }
    
    return result;
  } catch (e) {
    if (logContext?.userId && logContext?.requestId) {
      try { 
        const { appendLog } = await import('./logs');
        await appendLog(logContext.userId, logContext.requestId, "error", 
          `产品查找异常 sku=${sku || ""} slug=${slug || ""} handle=${logContext.productHandle || ""} 错误=${String(e)}`);
      } catch {}
    }
    return null;
  }
}
type LogCtx = { userId?: string; requestId?: string; productHandle?: string };
let defaultLogCtx: LogCtx | null = null;
export function setWooLogContext(ctx: LogCtx) { defaultLogCtx = ctx; }
export function clearWooLogContext() { defaultLogCtx = null; }
