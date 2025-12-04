import { useEffect, useState } from "react";
import { useImportStore } from "@/stores/importStore";
import SiteInputCard from "@/components/import/SiteInputCard";
import StatsBar from "@/components/import/StatsBar";
import OptionsRow from "@/components/import/OptionsRow";
import ProductItem from "@/components/import/ProductItem";
import RightPanel from "@/components/import/RightPanel";

export default function ListingTab() {
  const {
    products,
    logs,
    results,
    stats,
    selectedProducts,
    isLoading,
    error,
    status,
    parseListing,
    importProduct,
    importSelectedProducts,
    toggleProductSelection,
    selectAllProducts,
    deselectAllProducts,
    clearError,
    listingUrl,
    setListingUrl,
  } = useImportStore();

  // Initialize results on mount if there is an active request
  useEffect(() => {
    const st = useImportStore.getState();
    if (st.currentRequestId && (st.status === 'running' || st.status === 'parsing')) {
      st.startResultsForRequest(st.currentRequestId, false); // false = don't clear existing
      st.startLogsForRequest(st.currentRequestId);
      st.refreshStatus();
      st.startRunnerAutoCall();
    }
  }, [status]);

  const [defaultCategory, setDefaultCategory] = useState("");
  const [threads, setThreads] = useState(10);
  const [autoPagination, setAutoPagination] = useState(true);
  const [waitSeconds, setWaitSeconds] = useState(0);

  const handleDiscover = async (siteUrl: string) => {
    if (!siteUrl) return;
    await parseListing(siteUrl);
  };

  const handleImport = async (id: string) => {
    await importProduct(id);
  };

  const handleImportSelected = () => {
    importSelectedProducts();
  };

  const handleRemoveAll = () => {
    // Clear products from store
    useImportStore.setState({ products: [] });
  };

  // Show error notification
  useEffect(() => {
    if (error) {
      // You could add a toast notification here
      console.error('Import error:', error);
      // Clear error after 5 seconds
      const timer = setTimeout(() => clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)]">
      {/* Left Panel */}
      <main className="flex-1 p-6 space-y-6 overflow-y-auto">
        <SiteInputCard
          value={listingUrl}
          onChange={setListingUrl}
          onDiscover={(url) => handleDiscover(url)}
          loading={isLoading || status === 'running' || status === 'parsing'}
          disabled={status === 'running' || status === 'parsing'}
        />
        <StatsBar 
          imported={stats.imported} 
          queue={stats.queue} 
          errors={stats.errors} 
          total={products.length} 
        />
        <OptionsRow
          defaultCategory={defaultCategory}
          setDefaultCategory={setDefaultCategory}
          threads={threads}
          setThreads={setThreads}
          autoPagination={autoPagination}
          setAutoPagination={setAutoPagination}
          disabled={status === 'running' || status === 'parsing'}
        />

        {/* Product List */}
        <div className="space-y-3">
          {products.map((p) => (
            <ProductItem
              key={p.id}
              data={p}
              selected={selectedProducts.has(p.id)}
              onSelect={() => toggleProductSelection(p.id)}
              onImport={() => handleImport(p.id)}
              disabled={status === 'running' || status === 'parsing'}
            />
          ))}
        </div>

        {/* Batch Actions */}
        {products.length > 0 && (
          <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <button
              onClick={handleImportSelected}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              disabled={selectedProducts.size === 0 || isLoading || status === 'running' || status === 'parsing'}
            >
              导入选中 ({selectedProducts.size})
            </button>
            <button
              onClick={() => useImportStore.getState().stopImport()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              disabled={status !== 'running' && status !== 'parsing'}
            >
              结束
            </button>
            <button
              onClick={selectAllProducts}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || status === 'running' || status === 'parsing'}
            >
              全选
            </button>
            <button
              onClick={deselectAllProducts}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || status === 'running' || status === 'parsing'}
            >
              取消全选
            </button>
            <button
              onClick={handleRemoveAll}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || status === 'running' || status === 'parsing'}
            >
              清空全部
            </button>
          </div>
        )}

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

      {/* Right Panel */}
      <RightPanel
        logs={logs}
        results={results}
        products={products}
        fetched={stats.fetched}
        queue={stats.queue}
        imported={stats.imported}
        errors={stats.errors}
        status={status}
        waitSeconds={waitSeconds}
        setWaitSeconds={setWaitSeconds}
      />
    </div>
  );
}
