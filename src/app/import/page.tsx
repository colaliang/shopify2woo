"use client";
import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

export default function ImportPage() {
  const [importType, setImportType] = useState<"shopify" | "wordpress" | "wix">("shopify");
  const [shopifyBaseUrl, setShopifyBaseUrl] = useState("");
  const [productLinks, setProductLinks] = useState("");
  const [shopifyAllowed, setShopifyAllowed] = useState(true);
  const [wpMode, setWpMode] = useState<"all" | "links">("links");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [rid, setRid] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ requestId: string; source: string; itemKey: string; name?: string; productId?: number; createdAt: string }>>([]);
  const [counts, setCounts] = useState<{ processed: number; successCount: number; errorCount: number }>({ processed: 0, successCount: 0, errorCount: 0 });
  const [page, setPage] = useState(1);
  const [debugOpen, setDebugOpen] = useState(process.env.NODE_ENV !== "production");
  const [logs, setLogs] = useState<Array<{ level: string; message: string; createdAt: string }>>([]);
  const [runnerPing, setRunnerPing] = useState<NodeJS.Timeout | null>(null);
  const [evt, setEvt] = useState<EventSource | null>(null);
  const [cap, setCap] = useState<number>(1000);
  const isRunning = !!rid;

  const startTracking = useCallback((r: string) => {
    try { localStorage.setItem("importRequestId", r); } catch {}
    const storedSrc = (() => { try { return localStorage.getItem("importSource") || ""; } catch { return ""; } })();
    setRid(r);
    if (evt) { try { evt.close(); } catch {} setEvt(null); }
    if (!token) return;
    const url = `/api/import/sse?requestId=${encodeURIComponent(r)}&token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.addEventListener("logs", (ev: MessageEvent) => {
      try {
        const arr = JSON.parse(ev.data);
        if (Array.isArray(arr)) {
          const latest = arr.slice(Math.max(0, arr.length - 30));
          setLogs(latest);
        }
      } catch {}
    });
    es.addEventListener("history", (ev: MessageEvent) => {
      try { const arr = JSON.parse(ev.data); if (Array.isArray(arr)) setHistory(arr); } catch {}
    });
    es.addEventListener("counts", (ev: MessageEvent) => {
      try {
        const obj = JSON.parse(ev.data);
        if (obj && typeof obj.processed === 'number') {
          setCounts({ processed: obj.processed || 0, successCount: obj.successCount || 0, errorCount: obj.errorCount || 0 });
          const totalKey = `importTotal:${r}`;
          const totalStr = (() => { try { return localStorage.getItem(totalKey) || ""; } catch { return ""; } })();
          const total = parseInt(totalStr || "0", 10) || 0;
          if (total > 0 && obj.processed >= total) {
            try { localStorage.removeItem("importRequestId"); } catch {}
            try { localStorage.removeItem("importSource"); } catch {}
            try { localStorage.removeItem(totalKey); } catch {}
            if (evt) { try { evt.close(); } catch {} setEvt(null); }
            if (runnerPing) { clearInterval(runnerPing); setRunnerPing(null); }
            setRid(null);
            setMessage(`已完成：成功 ${obj.successCount || 0}，失败 ${obj.errorCount || 0}`);
          }
        }
      } catch {}
    });
    setEvt(es);
    if (process.env.NEXT_PUBLIC_ENABLE_CLIENT_RUNNER === "1") {
      if (runnerPing) { clearInterval(runnerPing); setRunnerPing(null); }
      const src = storedSrc || importType;
      (async()=>{ 
        try { 
          const controller = new AbortController();
          const timer = setTimeout(()=>controller.abort(), 5000);
          const r = await fetch(`/api/import/runner?source=${encodeURIComponent(src)}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'manual', cache: 'no-store', keepalive: true, signal: controller.signal }); 
          clearTimeout(timer);
          if (!r.ok) {
            if (r.status === 401) setMessage("Runner 未授权，已停止轮询");
            return;
          }
        } catch {}
      })();
      const rid2 = setInterval(async () => {
        try { 
          const controller = new AbortController();
          const timer = setTimeout(()=>controller.abort(), 5000);
          const r = await fetch(`/api/import/runner?source=${encodeURIComponent(src)}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'manual', cache: 'no-store', keepalive: true, signal: controller.signal }); 
          clearTimeout(timer);
          if (!r.ok) {
            if (runnerPing) { clearInterval(runnerPing); setRunnerPing(null); }
            if (r.status === 401) setMessage("Runner 未授权，已停止轮询");
          }
        } catch {}
      }, 10000);
      setRunnerPing(rid2);
    }
  }, [evt, importType, runnerPing, setEvt, setRid, setRunnerPing, token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const links = productLinks
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      let endpoint = "";
      let payload: Record<string, unknown> = {};
      if (importType === "shopify") {
        endpoint = "/api/import/shopify";
        payload = { shopifyBaseUrl, productLinks: links, mode: wpMode, cap: wpMode === "all" ? cap : undefined };
      } else if (importType === "wordpress") {
        endpoint = "/api/import/wordpress";
        payload = { sourceUrl, mode: wpMode, productLinks: links, cap: wpMode === "all" ? cap : undefined };
      } else {
        endpoint = "/api/import/wix";
        payload = { sourceUrl, mode: wpMode, productLinks: links, cap: wpMode === "all" ? cap : undefined };
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入失败");
      setMessage(`已提交导入，请求ID ${data.requestId}，产品数 ${data.count ?? (data.results?.length || 0)}`);
      if (data.requestId) {
        try { localStorage.setItem("importRequestId", data.requestId); } catch {}
        try { localStorage.setItem("importSource", importType); } catch {}
        try {
          const totalVal = (typeof data.count === 'number' ? data.count : ((Array.isArray(data.results) ? data.results.length : 0))) || 0;
          localStorage.setItem(`importTotal:${data.requestId}`, String(totalVal));
        } catch {}
        startTracking(data.requestId);

        if (process.env.NEXT_PUBLIC_ENABLE_CLIENT_RUNNER === "1") {
          if (runnerPing) { clearInterval(runnerPing); setRunnerPing(null); }
          const src = importType;
          try { 
            const controller = new AbortController();
            const timer = setTimeout(()=>controller.abort(), 5000);
            const r = await fetch(`/api/import/runner?source=${encodeURIComponent(src)}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'manual', cache: 'no-store', keepalive: true, signal: controller.signal });
            clearTimeout(timer);
            if (!r.ok && r.status === 401) setMessage("Runner 未授权，已停止轮询");
          } catch {}
          const rid = setInterval(async () => {
            try { 
              const controller = new AbortController();
              const timer = setTimeout(()=>controller.abort(), 5000);
              const r = await fetch(`/api/import/runner?source=${encodeURIComponent(src)}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'manual', cache: 'no-store', keepalive: true, signal: controller.signal }); 
              clearTimeout(timer);
              if (!r.ok) {
                if (runnerPing) { clearInterval(runnerPing); setRunnerPing(null); }
                if (r.status === 401) setMessage("Runner 未授权，已停止轮询");
              }
            } catch {}
          }, 10000);
          setRunnerPing(rid);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const rid = (() => { try { return localStorage.getItem("importRequestId") || ""; } catch { return ""; } })();
      if (rid) {
        try {
          const t = localStorage.getItem("form_importType");
          const s1 = localStorage.getItem("form_shopifyBaseUrl");
          const s2 = localStorage.getItem("form_sourceUrl");
          const pl = localStorage.getItem("form_productLinks");
          const m = localStorage.getItem("form_wpMode");
          const c = localStorage.getItem("form_cap");
          if (t === "shopify" || t === "wordpress" || t === "wix") setImportType(t);
          if (typeof s1 === "string") setShopifyBaseUrl(s1);
          if (typeof s2 === "string") setSourceUrl(s2);
          if (typeof pl === "string") setProductLinks(pl);
          if (m === "all" || m === "links") setWpMode(m);
          if (c && !Number.isNaN(parseInt(c, 10))) setCap(parseInt(c, 10));
        } catch {}
      } else {
        const params = new URLSearchParams(window.location.search);
        const url = params.get("shopifyUrl");
        const isShopify = params.get("isShopify");
        if (url) setShopifyBaseUrl(url);
        if (isShopify === "0") setShopifyAllowed(false);
      }
    }
    (async () => {
      const supabase = getSupabaseBrowser();
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      setToken(data.session?.access_token || null);
      try {
        const r = await fetch(`/api/import/history?page=${page}`, { headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
        const j = await r.json();
        if (r.ok && Array.isArray(j.items)) setHistory(j.items);
      } catch {}
    })();
  }, [page]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("form_importType", importType); } catch {}
  }, [importType]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("form_shopifyBaseUrl", shopifyBaseUrl); } catch {}
  }, [shopifyBaseUrl]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("form_sourceUrl", sourceUrl); } catch {}
  }, [sourceUrl]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("form_productLinks", productLinks); } catch {}
  }, [productLinks]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("form_wpMode", wpMode); } catch {}
  }, [wpMode]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("form_cap", String(cap)); } catch {}
  }, [cap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const r0 = localStorage.getItem("importRequestId") || "";
      if (r0) setRid(r0);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r0 = (() => { try { return localStorage.getItem("importRequestId") || ""; } catch { return ""; }})();
    if (r0 && token) startTracking(r0);
  }, [token, startTracking]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === ",") setDebugOpen((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (evt) { try { evt.close(); } catch {} }
      if (runnerPing) clearInterval(runnerPing);
    };
  }, [evt, runnerPing]);

  useEffect(() => {
    const active = !!rid;
    if (!active) {
      if (runnerPing) { clearInterval(runnerPing); setRunnerPing(null); }
    }
  }, [rid, runnerPing]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">产品导入</h1>
      <div className="mb-4">
        <label className="mr-4 text-sm font-medium">来源</label>
        <select
          value={importType}
          onChange={(e) => setImportType(e.target.value as "shopify" | "wordpress" | "wix")}
          className="border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isRunning}
        >
          <option value="shopify">Shopify</option>
          <option value="wordpress">WordPress</option>
          <option value="wix">Wix</option>
        </select>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        {importType === "shopify" ? (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Shopify 站点网址</label>
              <input
                type="url"
                placeholder="https://yourshop.myshopify.com"
                value={shopifyBaseUrl}
                onChange={(e) => setShopifyBaseUrl(e.target.value)}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-300"
                required
                disabled={!shopifyAllowed || isRunning}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">导入模式</label>
              <select value={wpMode} onChange={(e) => setWpMode(e.target.value as "all" | "links")} className="border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={isRunning}>
                <option value="links">指定链接</option>
                <option value="all">全站</option>
              </select>
            </div>
            {wpMode === "all" && (
              <div>
                <label className="block text-sm font-medium mb-1">抓取上限（cap）</label>
                <input type="number" min={1} max={5000} value={cap} onChange={(e)=>setCap(parseInt(e.target.value||"1000",10))} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-300" disabled={isRunning} />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">产品链接或 handle（逗号或换行分隔）</label>
              <textarea
                placeholder="https://yourshop.com/products/a, b-handle"
                value={productLinks}
                onChange={(e) => setProductLinks(e.target.value)}
                className="w-full border rounded px-3 py-2 h-32 focus:outline-none focus:ring disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-300"
                disabled={!shopifyAllowed || isRunning}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">源站</label>
                <input
                  type="url"
                  placeholder="https://source.com"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-300"
                  required
                  disabled={isRunning}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">导入模式</label>
              <select value={wpMode} onChange={(e) => setWpMode(e.target.value as "all" | "links")} className="border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={isRunning}>
                <option value="links">指定链接</option>
                <option value="all">全站</option>
              </select>
            </div>
            {wpMode === "all" && (
              <div>
                <label className="block text-sm font-medium mb-1">抓取上限（cap）</label>
                <input type="number" min={1} max={5000} value={cap} onChange={(e)=>setCap(parseInt(e.target.value||"1000",10))} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-300" disabled={isRunning} />
              </div>
            )}
            {wpMode === "links" && (
              <div>
                <label className="block text-sm font-medium mb-1">产品链接（逗号或换行分隔）</label>
                <textarea
                  placeholder="https://source.com/product/slug-a\nhttps://source.com/product/slug-b"
                  value={productLinks}
                  onChange={(e) => setProductLinks(e.target.value)}
                  className="w-full border rounded px-3 py-2 h-32 focus:outline-none focus:ring disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-300"
                  disabled={isRunning}
                />
              </div>
            )}
          </>
        )}
        <button
          type="submit"
          disabled={loading || isRunning || (importType === "shopify" && !shopifyAllowed)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "提交中…" : "提交导入"}
        </button>
        <button
          type="button"
          onClick={async ()=>{
            if (!rid) return;
            try {
              // 使用token或RUNNER_TOKEN作为回退
              const authToken = token || process.env.RUNNER_TOKEN || '';
              const headers: Record<string, string> = { 'Content-Type':'application/json' };
              if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
              }
              await fetch('/api/import/cancel', { method: 'POST', headers, body: JSON.stringify({ requestId: rid }) });
              setMessage('已结束任务');
              try { localStorage.removeItem('importRequestId'); } catch {}
              try { localStorage.removeItem('importSource'); } catch {}
              if (evt) { try { evt.close(); } catch {} setEvt(null); }
              if (runnerPing) { clearInterval(runnerPing); setRunnerPing(null); }
              setRid(null);
            } catch {}
          }}
          disabled={!rid}
          className="ml-2 inline-flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          结束
        </button>
      </form>
      {message && (
        <p className="mt-4 text-sm text-gray-700">{message}</p>
      )}
      <div className="mt-4">
        {rid ? (
          <div className="text-sm">当前任务：{rid}</div>
        ) : (
          <div className="text-sm text-gray-500">暂无进行中的任务</div>
        )}
        <div className="mt-2">
          {rid ? (
            <div className="text-sm">进度：{counts.processed}/{(()=>{try{const t=localStorage.getItem(`importTotal:${rid}`)||"";return parseInt(t||"0",10)||0;}catch{return 0;}})()}，成功 {counts.successCount}，失败 {counts.errorCount}</div>
          ) : null}
        </div>
        <div className="mt-2 border rounded p-3">
          <div className="text-sm font-medium mb-2">实时日志</div>
          <div className="max-h-64 overflow-auto text-xs">
            {logs.map((l, idx) => (
              <div key={idx} className="mb-1">
                <span className="mr-2">[{l.level}]</span>
                <span className="mr-2 text-gray-500">{new Date(l.createdAt).toLocaleTimeString()}</span>
                <span>{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-2">已成功导入记录</h2>
        <div className="space-y-2">
          {history.map((h) => (
            <div key={`${h.requestId}-${h.itemKey}`} className="flex justify-between border rounded px-3 py-2">
              <div className="text-sm">[{h.source}] {h.itemKey} — {h.name || ""}</div>
              <div className="text-xs text-gray-500">{new Date(h.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className="px-2 py-1 border rounded" disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))}>上一页</button>
          <span className="text-sm">第 {page} 页</span>
          <button className="px-2 py-1 border rounded" onClick={()=>setPage((p)=>p+1)}>下一页</button>
        </div>
      </div>
      {debugOpen && (
        <div className="fixed bottom-4 right-4 w-[480px] max-h-[50vh] overflow-auto bg-black text-green-300 text-xs p-3 rounded shadow-lg">
          <div className="mb-2 text-white">调试日志（Ctrl+, 切换）</div>
          {logs.map((l, idx) => (
            <div key={idx} className="mb-1">
              <span className="mr-2 text-yellow-300">[{l.level}]</span>
              <span className="mr-2 text-gray-400">{new Date(l.createdAt).toLocaleTimeString()}</span>
              <span>{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
