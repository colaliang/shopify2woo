"use client";

import { useState, useEffect } from "react";
import HeaderBar from "@/components/import/HeaderBar";
import ListingTab from "@/components/import/ListingTab";
import ProductTab from "@/components/import/ProductTab";
import { useImportStore } from "@/stores/importStore";

export default function Home() {
  const [tab, setTab] = useState<"listing" | "product">("product");
  const { currentRequestId, status } = useImportStore();

  // Resume subscriptions on mount if running, or fetch results if missing
  useEffect(() => {
    const st = useImportStore.getState();
    const hasRequest = !!currentRequestId;
    const isRunning = status === 'running' || status === 'parsing';
    // Check store state directly to avoid dependency loop
    const emptyResults = st.results.length === 0;

    if (hasRequest) {
      if (isRunning) {
        st.startLogsForRequest(currentRequestId!);
        st.startResultsForRequest(currentRequestId!, false);
        st.startRunnerAutoCall();
      } else if (emptyResults) {
        st.startResultsForRequest(currentRequestId!, false);
      }
    }
  }, [currentRequestId, status]); // Re-run when request ID restores or status changes

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Shopify/Wix/WP产品导入WooCommerce助手",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "CNY"
    },
    "description": "专业的跨境电商产品搬家工具，支持从WordPress, Shopify, Wix一键导入产品到WooCommerce。",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "100"
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeaderBar activeTab={tab} onTabChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === "listing" ? <ListingTab /> : <ProductTab />}
      </div>
    </div>
  );
}
