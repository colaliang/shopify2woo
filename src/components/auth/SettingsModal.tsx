import { useEffect, useRef, useState } from "react";
import { X, Globe, Folder, Settings as SettingsIcon } from "lucide-react";
import { useUserStore } from "@/stores/userStore";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

export default function SettingsModal() {
  const { settings, updateSettings, user, logout, settingsModalOpen, closeSettingsModal } = useUserStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [activeTab, setActiveTab] = useState<'wordpress' | 'import'>('wordpress');
  const [config, setConfig] = useState({ wordpressUrl: "", consumerKey: "", consumerSecret: "" });
  const [loadingCfg, setLoadingCfg] = useState(false);
  const disableAuth = process.env.NEXT_PUBLIC_DISABLE_AUTH === "1";
  const envUrl = process.env.NEXT_PUBLIC_WOO_TEST_URL || "";
  const envKey = process.env.NEXT_PUBLIC_WOO_TEST_KEY || "";
  const envSecret = process.env.NEXT_PUBLIC_WOO_TEST_SECRET || "";

  useEffect(() => {
    if (!settingsModalOpen) return;
    (async () => {
      setLoadingCfg(true);
      try {
        const supabase = getSupabaseBrowser();
        const { data } = supabase && !disableAuth ? await supabase.auth.getSession() : { data: { session: null } };
        const t = data.session?.access_token || null;
        const headers: Record<string, string> = {};
        if (t && !disableAuth) headers["Authorization"] = `Bearer ${t}`;
        const res = await fetch("/api/config/get", { headers });
        const j = await res.json().catch(() => ({}));
        const cfg = j?.data || j?.config;
        if (cfg) setConfig({
          wordpressUrl: String(cfg.wordpressUrl || cfg.wordpress_url || ""),
          consumerKey: String(cfg.consumerKey || cfg.consumer_key || ""),
          consumerSecret: String(cfg.consumerSecret || cfg.consumer_secret || ""),
        });
        if (envUrl || envKey || envSecret) {
          setConfig((prev) => ({
            wordpressUrl: prev.wordpressUrl || envUrl,
            consumerKey: prev.consumerKey || envKey,
            consumerSecret: prev.consumerSecret || envSecret,
          }));
        }
      } finally {
        setLoadingCfg(false);
      }
    })();
  }, [settingsModalOpen, disableAuth, envUrl, envKey, envSecret]);


  const handleSave = () => {
    updateSettings(localSettings);
    closeSettingsModal();
  };

  const saveConfig = async () => {
    setLoadingCfg(true);
    try {
      let authToken: string | null = null;
      if (!disableAuth) {
        const supabase = getSupabaseBrowser();
        const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        authToken = data.session?.access_token || null;
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken && !disableAuth) headers["Authorization"] = `Bearer ${authToken}`;
      const res = await fetch("/api/config/save", {
        method: "POST",
        headers,
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || "保存失败"));
    } finally {
      setLoadingCfg(false);
    }
  };

  const handleLogout = () => {
    logout();
    closeSettingsModal();
  };

  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const el = panelRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        closeSettingsModal();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [closeSettingsModal]);

  if (!settingsModalOpen) return null;

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-full max-w-2xl">
      <div ref={panelRef} className="bg-white rounded-lg shadow-xl border border-gray-200 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">系统设置</h2>
          <button
            onClick={closeSettingsModal}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('wordpress')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'wordpress'
                ? 'text-primary-600 border-primary-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <Globe className="w-4 h-4" />
            WordPress 设置
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'import'
                ? 'text-primary-600 border-primary-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            导入选项
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'wordpress' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">WordPress 站点网址</label>
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
              <div className="pt-2">
                <button
                  onClick={saveConfig}
                  disabled={loadingCfg}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {loadingCfg ? "保存中…" : "保存配置"}
                </button>
              </div>
            </>
          )}
          
          {activeTab === 'import' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  默认商品分类
                </label>
                <div className="relative">
                  <Folder className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={localSettings.defaultCategory}
                    onChange={(e) => setLocalSettings({...localSettings, defaultCategory: e.target.value})}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                    placeholder="请输入默认分类"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  导入线程数
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={localSettings.importThreads}
                  onChange={(e) => setLocalSettings({...localSettings, importThreads: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={localSettings.autoPagination}
                    onChange={(e) => setLocalSettings({...localSettings, autoPagination: e.target.checked})}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">自动分页</span>
                </label>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  等待时间（秒）
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={localSettings.waitSeconds}
                  onChange={(e) => setLocalSettings({...localSettings, waitSeconds: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </>
          )}
          
          {user && (
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">当前用户</p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                >
                  退出登录
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={closeSettingsModal}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}