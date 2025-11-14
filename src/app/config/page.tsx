"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Config = {
  wordpressUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

export default function ConfigPage() {
  const [config, setConfig] = useState<Config>({
    wordpressUrl: "",
    consumerKey: "",
    consumerSecret: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowser();
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const t = data.session?.access_token || null;
      setToken(t);
      
      try {
        const res = await fetch("/api/config/get", { headers: t ? { Authorization: `Bearer ${t}` } : {} });
        const data = await res.json();
        if (res.ok) {
          const cfg = data?.data || data?.config;
          if (cfg) setConfig(cfg);
        }
      } catch {}
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      let authToken = token;
      if (!authToken) {
        const supabase = getSupabaseBrowser();
        const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        authToken = data.session?.access_token || null;
        setToken(authToken);
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      const res = await fetch("/api/config/save", {
        method: "POST",
        headers,
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setMessage("已保存配置");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">配置 WooCommerce</h1>
      
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">WordPress 站点网址</label>
          <input
            type="url"
            placeholder="https://example.com"
            value={config.wordpressUrl}
            onChange={(e) => setConfig({ ...config, wordpressUrl: e.target.value })}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring"
            required
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">CONSUMER_KEY</label>
            <input
              type="text"
              value={config.consumerKey}
              onChange={(e) => setConfig({ ...config, consumerKey: e.target.value })}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">CONSUMER_SECRET</label>
            <input
              type="password"
              value={config.consumerSecret}
              onChange={(e) => setConfig({ ...config, consumerSecret: e.target.value })}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring"
              required
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "保存中…" : "保存配置"}
        </button>
      </form>
      {message && (
        <p className="mt-4 text-sm text-gray-700">{message}</p>
      )}
      <p className="mt-6 text-xs text-gray-500">提示：密钥将迁移到 Supabase 服务端存储，避免在前端或扩展中暴露。</p>
    </div>
  );
}
