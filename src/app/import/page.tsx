"use client";
import { useState } from "react";

export default function ImportPage() {
  const [shopifyBaseUrl, setShopifyBaseUrl] = useState("");
  const [productLinks, setProductLinks] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const links = productLinks
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/import/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopifyBaseUrl, productLinks: links }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入失败");
      setMessage(`已提交导入，请求ID ${data.requestId}，产品数 ${data.count}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">导入 Shopify 产品</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Shopify 站点网址</label>
          <input
            type="url"
            placeholder="https://yourshop.myshopify.com"
            value={shopifyBaseUrl}
            onChange={(e) => setShopifyBaseUrl(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">产品链接或 handle（逗号或换行分隔）</label>
          <textarea
            placeholder="https://yourshop.com/products/a, b-handle"
            value={productLinks}
            onChange={(e) => setProductLinks(e.target.value)}
            className="w-full border rounded px-3 py-2 h-32 focus:outline-none focus:ring"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "提交中…" : "提交导入"}
        </button>
      </form>
      {message && (
        <p className="mt-4 text-sm text-gray-700">{message}</p>
      )}
    </div>
  );
}