"use client";
import { useState } from "react";
type HealthResponse = { ok: boolean; env: { supabase_server_url: boolean; supabase_server_key: boolean; supabase_client_url: boolean; supabase_client_key: boolean; runner_token: boolean; image_cache_bucket: string }; supabase: { storage_access: boolean; pgmq_rpc: boolean }; reasons: string[]; ts: string };

export default function Page() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hLoading, setHLoading] = useState(false);
  const [hError, setHError] = useState<string | null>(null);
  const [hData, setHData] = useState<HealthResponse | null>(null);
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const r = await fetch(`/api/debug/scrape?url=${encodeURIComponent(url)}`, { cache: "no-store", signal: controller.signal });
      clearTimeout(timer);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) {
        setError(typeof j?.error === "string" ? j.error : `请求失败 ${r.status}`);
      } else {
        setData(j);
      }
    } catch (e) {
      setError(String((e as Error)?.message || e || "unknown"));
    } finally {
      setLoading(false);
    }
  }
  async function onHealth() {
    setHLoading(true);
    setHError(null);
    setHData(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const token = process.env.NEXT_PUBLIC_RUNNER_TOKEN || "";
      const u = token ? `/api/import/health?token=${encodeURIComponent(token)}` : `/api/import/health`;
      const r = await fetch(u, { cache: "no-store", signal: controller.signal });
      clearTimeout(timer);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) {
        setHError(typeof j?.error === "string" ? j.error : `请求失败 ${r.status}`);
      } else {
        setHData(j);
      }
    } catch (e) {
      setHError(String((e as Error)?.message || e || "unknown"));
    } finally {
      setHLoading(false);
    }
  }
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-medium">单产品抓取测试</h1>
      <form onSubmit={onSubmit} className="space-y-2">
        <input value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="输入产品页面URL" className="w-full border rounded px-3 py-2" />
        <button disabled={!url || loading} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">{loading?"请求中...":"抓取"}</button>
      </form>
      {error ? (<div className="text-red-600 text-sm">{error}</div>) : null}
      {data ? (
        <div className="text-sm">
          <div className="mb-2">最终URL：{String(data.finalUrl||"")}</div>
          <div className="mb-2">内容类型：{String(data.contentType||"")}</div>
          <div className="mb-2">名称：{String(data.name||"")}</div>
          <div className="mb-2">SKU：{String(data.skuRaw||"")} → {String(data.skuNormalized||"")}</div>
          <div className="mb-2">主分类：{String(data.primaryCategory||"")}</div>
          <div className="mb-2">分类集合：{Array.isArray(data.filteredCategories)?(data.filteredCategories as string[]).join(" | "):""}</div>
          <div className="mb-2">候选图片数量：{Number(data.galleryCount||0)}</div>
          <div className="mb-2">选定图片数量：{Number(data.selectedCount||0)}</div>
          <div className="mt-2 border rounded p-2 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</div>
        </div>
      ) : null}
      <div className="pt-4 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={onHealth} disabled={hLoading} className="px-3 py-2 bg-emerald-600 text-white rounded disabled:opacity-50">{hLoading?"检查中...":"健康检查"}</button>
        </div>
        {hError ? (<div className="text-red-600 text-sm">{hError}</div>) : null}
        {hData ? (
          <div className="text-sm">
            <div className="mb-1">服务可用：{String(hData.ok)}</div>
            <div className="mb-1">Supabase存储：{String(hData.supabase.storage_access)}</div>
            <div className="mb-1">PGMQ RPC：{String(hData.supabase.pgmq_rpc)}</div>
            <div className="mt-2 border rounded p-2 whitespace-pre-wrap">{JSON.stringify(hData, null, 2)}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}