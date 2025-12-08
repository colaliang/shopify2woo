import { useEffect, useRef, useState } from "react";
import { X, Globe, History, Languages, HelpCircle, Bell } from "lucide-react";
import { useUserStore } from "@/stores/userStore";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import SubscriptionSettings from "@/components/user/SubscriptionSettings";

interface Transaction {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string;
  created_at: string;
}

export default function SettingsModal() {
  const { settings, updateSettings, user, logout, settingsModalOpen, closeSettingsModal } = useUserStore();
  const [activeTab, setActiveTab] = useState<'wordpress' | 'language' | 'history' | 'notifications'>('wordpress');
  const [config, setConfig] = useState({ wordpressUrl: "", consumerKey: "", consumerSecret: "" });
  const [loadingCfg, setLoadingCfg] = useState(false);
  
  // History state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);

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

  // Fetch history when tab changes to history
  useEffect(() => {
    if (activeTab === 'history' && settingsModalOpen) {
      fetchHistory(1);
    }
  }, [activeTab, settingsModalOpen]);

  const fetchHistory = async (page: number) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/credits/history?page=${page}&limit=10`);
      const data = await res.json();
      if (data.data) {
        setTransactions(data.data);
        setHistoryTotal(data.pagination.total);
        setHistoryPage(page);
      }
    } catch (error) {
      console.error("Fetch history failed", error);
    } finally {
      setLoadingHistory(false);
    }
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

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' },
    { code: 'it', name: 'Italiano' },
    { code: 'ru', name: 'Русский' },
    { code: 'pt', name: 'Português' },
    { code: 'zh-CN', name: '中文（简体）' },
    { code: 'zh-TW', name: '中文（繁体）' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
  ];

  const handleLanguageChange = (code: string) => {
    updateSettings({ language: code });
  };

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
            onClick={() => setActiveTab('language')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'language'
                ? 'text-primary-600 border-primary-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <Languages className="w-4 h-4" />
            语言
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'history'
                ? 'text-primary-600 border-primary-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <History className="w-4 h-4" />
            积分流水
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'notifications'
                ? 'text-primary-600 border-primary-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <Bell className="w-4 h-4" />
            通知设置
          </button>

          <a
            href="/docs/index.html"
            target="_blank"
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-gray-700"
          >
            <HelpCircle className="w-4 h-4" />
            帮助
          </a>
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

          {activeTab === 'language' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">选择界面语言</label>
                <div className="grid grid-cols-2 gap-3">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`flex items-center px-4 py-3 border rounded-lg text-sm transition-colors ${
                        settings.language === lang.code
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full mr-3 ${
                         settings.language === lang.code ? 'bg-primary-600' : 'bg-transparent'
                      }`} />
                      {lang.name}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs text-gray-500">
                  注意：语言切换功能目前仅更新设置，界面多语言支持正在开发中。
                </p>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {loadingHistory ? (
                <div className="text-center py-8 text-gray-500">加载中...</div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">暂无交易记录</div>
              ) : (
                <>
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                        <div>
                           <div className="font-medium text-sm text-gray-900">{tx.description || tx.type}</div>
                           <div className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                           <div className={`font-bold text-sm ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                             {tx.amount > 0 ? '+' : ''}{tx.amount}
                           </div>
                           <div className="text-xs text-gray-500">余额: {tx.balance_after}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Pagination */}
                  <div className="flex justify-between items-center pt-2">
                    <button 
                       disabled={historyPage <= 1}
                       onClick={() => fetchHistory(historyPage - 1)}
                       className="text-xs text-gray-500 disabled:opacity-50 hover:text-gray-900"
                    >
                      上一页
                    </button>
                    <span className="text-xs text-gray-500">第 {historyPage} 页</span>
                    <button 
                       disabled={historyPage * 10 >= historyTotal}
                       onClick={() => fetchHistory(historyPage + 1)}
                       className="text-xs text-gray-500 disabled:opacity-50 hover:text-gray-900"
                    >
                      下一页
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
             <SubscriptionSettings />
          )}
          
          {user && (
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">当前用户</p>
                  <p className="text-sm text-gray-500">
                    {user.email && user.email.startsWith('wechat_') ? user.name : user.email}
                  </p>
                  <p className="text-xs text-blue-600 mt-1 font-medium">
                    剩余积分: {user.credits ?? 0}
                  </p>
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
      </div>
    </div>
  );
}