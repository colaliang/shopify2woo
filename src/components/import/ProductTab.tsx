import { useEffect, useMemo, useState } from "react";
import { useImportStore } from "@/stores/importStore";
import URLInputCard from "@/components/import/URLInputCard";
import ProductItem, { ProductItemData } from "@/components/import/ProductItem";
import RightPanel from "@/components/import/RightPanel";

export default function ProductTab() {
  const [url, setUrl] = useState("");
  
  const {
    products,
    logs,
    stats,
    isLoading,
    error,
    importProduct,
    clearError,
    setProducts,
  } = useImportStore();

  const handleExtract = async (u: string) => {
    if (!u) return;
    try {
      const link = u.trim();
      let title = link;
      try {
        const p = new URL(link);
        const segs = p.pathname.split('/').filter(Boolean);
        title = segs[segs.length - 1] || link;
      } catch {}
      setProducts([{ id: 'single', title, link, thumbnail: 'https://via.placeholder.com/64', price: '', attributesCount: 0, reviewsCount: 0, galleryCount: 0, inStock: true }]);
    } catch {}
  };

  const handleImport = async () => {
    if (products.length > 0) {
      await importProduct(products[0].id);
    }
  };

  const mappedProduct: ProductItemData | null = useMemo(() => {
    if (products.length === 0) return null;
    const firstProduct = products[0];
    return {
      id: firstProduct.id,
      title: firstProduct.title,
      link: firstProduct.link,
      thumbnail: firstProduct.thumbnail,
      price: firstProduct.price,
      attributesCount: firstProduct.attributesCount || 0,
      reviewsCount: firstProduct.reviewsCount || 0,
      galleryCount: firstProduct.galleryCount || 0,
      inStock: firstProduct.inStock,
    };
  }, [products]);

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
            disabled={isLoading}
          >
            结束
          </button>
        </div>

        {mappedProduct && (
          <ProductItem
            data={mappedProduct}
            selected={false}
            onSelect={() => {}}
            onImport={handleImport}
          />
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

      <RightPanel
        logs={logs}
        fetched={stats.fetched}
        queue={stats.queue}
        errors={stats.errors}
        waitSeconds={0}
        setWaitSeconds={() => {}}
      />
    </div>
  );
}
