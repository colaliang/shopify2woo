import { useEffect, useState } from "react";
import { useImportStore } from "@/stores/importStore";
import { useUserStore } from "@/stores/userStore";
import URLInputCard from "@/components/import/URLInputCard";
import RightPanel from "@/components/import/RightPanel";
import ChoosePlatform, { PlatformType } from "@/components/import/ChoosePlatform";

export default function ProductTab() {
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<PlatformType>('wordpress');
  
  const {
    logs,
    stats,
    isLoading,
    error,
    importProduct,
    clearError,
    results,
    status,
  } = useImportStore();

  const handleExtract = async (u: string) => {
    if (!u) return;
    if (!useUserStore.getState().isAuthenticated) {
      useUserStore.getState().openLoginModal();
      return;
    }
    const tokens = u
      .split(/[\n\r\t\s,，;；、]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(tokens));
    if (uniq.length === 0) return;
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
          value={url}
          onChange={setUrl}
          onExtract={handleExtract}
          loading={isLoading}
        />

        <div className="flex items-center gap-3">
          <button
            onClick={() => useImportStore.getState().stopImport()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            disabled={status !== 'running' && status !== 'parsing'}
          >
            结束
          </button>
        </div>

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

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="text-red-600 font-medium">错误:</div>
              <div className="text-red-700">{error}</div>
            </div>
          </div>
        )}
      </main>

      <RightPanel
        logs={logs}
        fetched={stats.fetched}
        queue={stats.queue}
        imported={stats.imported}
        errors={stats.errors}
        status={status}
        waitSeconds={0}
        setWaitSeconds={() => {}}
      />
    </div>
  );
}
