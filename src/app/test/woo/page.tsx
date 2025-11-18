"use client";
import { useState } from "react";

export default function WooTestPage() {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [authMode, setAuthMode] = useState<"query" | "basic">("basic");
  const [out, setOut] = useState<string>("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [slug, setSlug] = useState("");
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");

  async function call(action: string, payload: Record<string, unknown> = {}) {
    setOut("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/test/woo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, consumerKey: key, consumerSecret: secret, authMode, action, payload }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(()=>null);
      setOut(JSON.stringify(data, null, 2));
    } catch (e) {
      clearTimeout(timer);
      setOut(String(e));
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">WordPress Woo API 测试</h1>
      <div className="grid grid-cols-2 gap-4">
        <input className="border px-2 py-1" placeholder="站点URL，如 https://example.com/" value={url} onChange={(e)=>setUrl(e.target.value)} />
        <select className="border px-2 py-1" value={authMode} onChange={(e)=>setAuthMode(e.target.value as any)}>
          <option value="query">Query Auth</option>
          <option value="basic">Basic Auth</option>
        </select>
        <input className="border px-2 py-1" placeholder="consumer_key" value={key} onChange={(e)=>setKey(e.target.value)} />
        <input className="border px-2 py-1" placeholder="consumer_secret" value={secret} onChange={(e)=>setSecret(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-4 items-end">
        <div className="space-y-2">
          <input className="border px-2 py-1 w-full" placeholder="分类搜索关键词" value={name} onChange={(e)=>setName(e.target.value)} />
          <button className="border px-3 py-1" onClick={()=>call("listCategories", { search: name })}>读取分类</button>
        </div>
        <div className="space-y-2">
          <input className="border px-2 py-1 w-full" placeholder="新建分类名称" value={name} onChange={(e)=>setName(e.target.value)} />
          <button className="border px-3 py-1" onClick={()=>call("createCategory", { name })}>新建分类</button>
        </div>
        <div className="space-y-2">
          <input className="border px-2 py-1 w-full" placeholder="产品SKU或slug" value={sku || slug} onChange={(e)=>{ const v=e.target.value; if (v.includes(" ")) setSku(v); else setSlug(v); }} />
          <button className="border px-3 py-1" onClick={()=>call("listProducts", { sku, slug })}>读取产品</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 items-end">
        <input className="border px-2 py-1" placeholder="产品名称" value={productName} onChange={(e)=>setProductName(e.target.value)} />
        <input className="border px-2 py-1" placeholder="产品slug" value={slug} onChange={(e)=>setSlug(e.target.value)} />
        <input className="border px-2 py-1" placeholder="产品描述" value={productDesc} onChange={(e)=>setProductDesc(e.target.value)} />
      </div>
      <div>
        <button className="border px-3 py-1" onClick={()=>call("createProduct", { name: productName || slug, slug, description: productDesc || slug })}>创建产品</button>
      </div>

      <pre className="border p-3 whitespace-pre-wrap text-xs" style={{ minHeight: 160 }}>{out}</pre>
    </div>
  );
}