"use client";
import { useState } from "react";

export default function WooTestPage() {
  const defaultUrl = process.env.NEXT_PUBLIC_WOO_TEST_URL || "";
  const defaultKey = process.env.NEXT_PUBLIC_WOO_TEST_KEY || "";
  const defaultSecret = process.env.NEXT_PUBLIC_WOO_TEST_SECRET || "";
  const [url, setUrl] = useState(defaultUrl);
  const [key, setKey] = useState(defaultKey);
  const [secret, setSecret] = useState(defaultSecret);
  const [authMode, setAuthMode] = useState<"query" | "basic">("basic");
  const [useIndexPhp, setUseIndexPhp] = useState<boolean>(true);
  const [out, setOut] = useState<string>("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [slug, setSlug] = useState("");
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [productShortDesc, setProductShortDesc] = useState("");
  const [regularPrice, setRegularPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [categoryIds, setCategoryIds] = useState("");
  const [productSku, setProductSku] = useState("");

  async function call(action: string, payload: Record<string, unknown> = {}) {
    setOut("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/test/woo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, consumerKey: key, consumerSecret: secret, authMode, useIndexPhp, action, payload }),
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
        <select className="border px-2 py-1" value={authMode} onChange={(e)=>setAuthMode(e.target.value === "basic" ? "basic" : "query")}>
          <option value="query">Query Auth</option>
          <option value="basic">Basic Auth</option>
        </select>
        <input className="border px-2 py-1" placeholder="consumer_key" value={key} onChange={(e)=>setKey(e.target.value)} />
        <input className="border px-2 py-1" placeholder="consumer_secret" value={secret} onChange={(e)=>setSecret(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useIndexPhp} onChange={(e)=>setUseIndexPhp(e.target.checked)} /> 使用 /index.php/wp-json/wc/v3</label>
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
        <input className="border px-2 py-1" placeholder="产品SKU" value={productSku} onChange={(e)=>setProductSku(e.target.value)} />
        <input className="border px-2 py-1" placeholder="Slug (可选)" value={slug} onChange={(e)=>setSlug(e.target.value)} />
        
        <input className="border px-2 py-1" placeholder="常规价格 (regular_price)" value={regularPrice} onChange={(e)=>setRegularPrice(e.target.value)} />
        <input className="border px-2 py-1" placeholder="促销价格 (sale_price)" value={salePrice} onChange={(e)=>setSalePrice(e.target.value)} />
        <input className="border px-2 py-1" placeholder="分类ID (逗号分隔)" value={categoryIds} onChange={(e)=>setCategoryIds(e.target.value)} />
        
        <textarea className="border px-2 py-1 col-span-3" placeholder="产品短描述 (short_description)" rows={2} value={productShortDesc} onChange={(e)=>setProductShortDesc(e.target.value)} />
        <textarea className="border px-2 py-1 col-span-3" placeholder="产品详细描述 (description)" rows={4} value={productDesc} onChange={(e)=>setProductDesc(e.target.value)} />
      </div>
      <div>
        <button className="border px-3 py-1 bg-blue-500 text-white" onClick={()=>{
          const cats = categoryIds.split(",").map(s=>s.trim()).filter(Boolean).map(id=>({ id: parseInt(id) }));
          call("createProduct", { 
            name: productName || "测试产品", 
            sku: productSku,
            slug, 
            type: "simple",
            regular_price: regularPrice,
            sale_price: salePrice,
            short_description: productShortDesc,
            description: productDesc,
            categories: cats.length ? cats : undefined
          });
        }}>创建产品 (Create Product)</button>
      </div>

      <pre className="border p-3 whitespace-pre-wrap text-xs" style={{ minHeight: 160 }}>{out}</pre>
    </div>
  );
}