import { useEffect, useState } from "react";
import { useImportStore } from "@/stores/importStore";
import { useUserStore } from "@/stores/userStore";
import URLInputCard from "@/components/import/URLInputCard";
import RightPanel from "@/components/import/RightPanel";
import ChoosePlatform, { PlatformType } from "@/components/import/ChoosePlatform";
import { parseInputLinks } from "@/lib/inputHelpers";

function detectPlatformFromUrl(url: string): PlatformType | null {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    const p = u.pathname.toLowerCase();

    if (h.includes('myshopify.com')) return 'shopify';
    if (h.includes('wix.com') || h.includes('wixsite.com')) return 'wix';
    if (h.includes('wordpress.com')) return 'wordpress';
    
    if (p.includes('/product-page/')) return 'wix';
    
    return null;
  } catch {
    return null;
  }
}

export default function ProductTab() {
  const [platform, setPlatform] = useState<PlatformType>('wordpress');
  
  const {
    logs,
    stats,
    isLoading,
    error,
    importProduct,
    clearError,
    results,
    products,
    status,
    productUrl,
    setProductUrl,
    currentRequestId,
    resultsPage,
    resultsTotal,
    resultsLimit,
    resultsLoading,
    fetchUserResults,
  } = useImportStore();

  // Initialize results on mount (fetch user history)
  useEffect(() => {
    useImportStore.getState().fetchUserResults(1);
  }, []);

  // Handle realtime updates for active request
  useEffect(() => {
    const st = useImportStore.getState();
    const hasRequest = !!currentRequestId;
    const isRunning = status === 'running' || status === 'parsing';

    // Always subscribe to results for the user (supports realtime updates for list)
    st.startResultsForRequest(currentRequestId || '');

    if (hasRequest && isRunning) {
        // Resume running task realtime updates
        st.startLogsForRequest(currentRequestId!);
        st.refreshStatus();
        st.startRunnerAutoCall();
    }
  }, [status, currentRequestId]);

  const handleExtract = async (u: string) => {
    if (!u) return;
    if (!useUserStore.getState().isAuthenticated) {
      useUserStore.getState().openLoginModal();
      return;
    }
    const uniq = parseInputLinks(u);
    if (uniq.length === 0) return;

    // Check platform mismatch
    if (uniq.length > 0) {
      const detected = detectPlatformFromUrl(uniq[0]);
      if (detected && detected !== platform) {
        const platformNames: Record<string, string> = {
          wordpress: 'WordPress',
          shopify: 'Shopify',
          wix: 'Wix'
        };
        const msg = `检测到链接可能来自 ${platformNames[detected] || detected}，但当前选择的是 ${platformNames[platform] || platform}。\n\n是否继续？`;
        if (!window.confirm(msg)) {
          return;
        }
      }
    }

    await useImportStore.getState().enqueueLinks(uniq, uniq[0], platform);
  };

  void importProduct;

  // Show error notification
  useEffect(() => {
    if (error) {
      console.error('Import error:', error);
      const timer = setTimeout(() => clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)]">
      <main className="flex-1 p-6 space-y-6 overflow-y-auto">
        <ChoosePlatform
          selected={platform}
          onSelect={setPlatform}
          disabled={status === 'running' || status === 'parsing'}
        />
        <URLInputCard
          value={productUrl}
          onChange={setProductUrl}
          onExtract={handleExtract}
          loading={isLoading || status === 'running' || status === 'parsing'}
          disabled={status === 'running' || status === 'parsing'}
        />

        <div className="flex items-center gap-3">
          <button
            onClick={() => useImportStore.getState().stopImport()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            disabled={status !== 'running' && status !== 'parsing'}
          >
            {status === 'stopping' ? '正在停止...' : '结束'}
          </button>
        </div>

        { /*
        <div className="space-y-3">
          {results.length === 0 && (
            <div className="text-gray-500">暂无导入结果，点击上方“导入”开始</div>
          )}
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
              <div className="flex-1">
                <div className="text-sm font-medium">{r.name || r.itemKey || '未知商品'}</div>
                {r.message && <div className="text-xs text-gray-500 mt-1">{r.message}</div>}
              </div>
              <div className={"text-xs px-2 py-1 rounded " + (r.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{r.status === 'success' ? '成功' : '失败'}</div>
            </div>
          ))}
        </div>

   
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="text-red-600 font-medium">错误:</div>
              <div className="text-red-700">{error}</div>
            </div>
          </div>
        )}

        */ }

        
      </main>

      

      <RightPanel
        logs={logs}
        results={results}
        products={products}
        fetched={stats.fetched}
        queue={stats.queue}
        imported={stats.imported}
        errors={stats.errors}
        status={status}
        waitSeconds={0}
        setWaitSeconds={() => {}}
        page={resultsPage}
        total={resultsTotal}
        limit={resultsLimit}
        resultsLoading={resultsLoading}
        onPageChange={(p) => fetchUserResults(p)}
      />
    </div>
  );
}
