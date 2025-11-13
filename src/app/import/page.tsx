"use client";
import { useEffect, useState } from "react";
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
  const [progress, setProgress] = useState<{ requestId?: string; total?: number; processed?: number; successCount?: number; errorCount?: number; status?: string } | null>(null);
  const [polling, setPolling] = useState<any>(null);
  const [history, setHistory] = useState<Array<{ requestId: string; source: string; itemKey: string; name?: string; productId?: number; createdAt: string }>>([]);
  const [page, setPage] = useState(1);
  const [debugOpen, setDebugOpen] = useState(process.env.NODE_ENV !== "production");
  const [logs, setLogs] = useState<Array<{ level: string; message: string; createdAt: string }>>([]);
  const [logPolling, setLogPolling] = useState<any>(null);
  const [cap, setCap] = useState<number>(1000);

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
        setProgress({ requestId: data.requestId });
        if (polling) clearInterval(polling);
        const id = setInterval(async () => {
          try {
            const r = await fetch(`/api/import/status?requestId=${data.requestId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            const j = await r.json();
            if (r.ok && j?.job) {
              setProgress(j.job);
              if (j.job?.status === "done") {
                clearInterval(id);
                setPolling(null);
              }
            }
          } catch {}
        }, 1500);
        setPolling(id);
        if (logPolling) clearInterval(logPolling);
        const lid = setInterval(async () => {
          try {
            if (!debugOpen) return;
            const r = await fetch(`/api/import/logs?requestId=${data.requestId}&limit=5000`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            const j = await r.json();
            if (r.ok && Array.isArray(j.items)) setLogs(j.items);
          } catch {}
        }, 1500);
        setLogPolling(lid);
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
      const params = new URLSearchParams(window.location.search);
      const url = params.get("shopifyUrl");
      const isShopify = params.get("isShopify");
      if (url) setShopifyBaseUrl(url);
      if (isShopify === "0") setShopifyAllowed(false);
    }
    (async () => {
      const supabase = getSupabaseBrowser();
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } } as any;
      setToken(data.session?.access_token || null);
      try {
        const r = await fetch(`/api/import/history?page=${page}`, { headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
        const j = await r.json();
        if (r.ok && Array.isArray(j.items)) setHistory(j.items);
      } catch {}
    })();
  }, [page]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === "k") setDebugOpen((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">产品导入</h1>
      <div className="mb-4">
        <label className="mr-4 text-sm font-medium">来源</label>
        <select
          value={importType}
          onChange={(e) => setImportType(e.target.value as any)}
          className="border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring"
                required
                disabled={!shopifyAllowed}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">导入模式</label>
              <select value={wpMode} onChange={(e) => setWpMode(e.target.value as any)} className="border rounded px-3 py-2">
                <option value="links">指定链接</option>
                <option value="all">全站</option>
              </select>
            </div>
            {wpMode === "all" && (
              <div>
                <label className="block text-sm font-medium mb-1">抓取上限（cap）</label>
                <input type="number" min={1} max={5000} value={cap} onChange={(e)=>setCap(parseInt(e.target.value||"1000",10))} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">产品链接或 handle（逗号或换行分隔）</label>
              <textarea
                placeholder="https://yourshop.com/products/a, b-handle"
                value={productLinks}
                onChange={(e) => setProductLinks(e.target.value)}
                className="w-full border rounded px-3 py-2 h-32 focus:outline-none focus:ring"
                disabled={!shopifyAllowed}
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
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">导入模式</label>
              <select value={wpMode} onChange={(e) => setWpMode(e.target.value as any)} className="border rounded px-3 py-2">
                <option value="links">指定链接</option>
                <option value="all">全站</option>
              </select>
            </div>
            {wpMode === "all" && (
              <div>
                <label className="block text-sm font-medium mb-1">抓取上限（cap）</label>
                <input type="number" min={1} max={5000} value={cap} onChange={(e)=>setCap(parseInt(e.target.value||"1000",10))} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring" />
              </div>
            )}
            {wpMode === "links" && (
              <div>
                <label className="block text-sm font-medium mb-1">产品链接（逗号或换行分隔）</label>
                <textarea
                  placeholder="https://source.com/product/slug-a\nhttps://source.com/product/slug-b"
                  value={productLinks}
                  onChange={(e) => setProductLinks(e.target.value)}
                  className="w-full border rounded px-3 py-2 h-32 focus:outline-none focus:ring"
                />
              </div>
            )}
          </>
        )}
        <button
          type="submit"
          disabled={loading || (importType === "shopify" && !shopifyAllowed)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "提交中…" : "提交导入"}
        </button>
      </form>
      {message && (
        <p className="mt-4 text-sm text-gray-700">{message}</p>
      )}
      {progress && (
        <div className="mt-4">
          <div className="text-sm">进度：{progress.processed ?? 0}/{progress.total ?? 0}，成功 {progress.successCount ?? 0}，失败 {progress.errorCount ?? 0}，状态 {progress.status}</div>
          <div className="w-full bg-gray-200 h-2 mt-2 rounded">
            <div className="bg-blue-600 h-2 rounded" style={{ width: `${Math.min(100, Math.round(((progress.processed ?? 0) / Math.max(1, progress.total ?? 1)) * 100))}%` }}></div>
          </div>
        </div>
      )}
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
          <div className="mb-2 text-white">调试日志（Ctrl+K 切换）</div>
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
