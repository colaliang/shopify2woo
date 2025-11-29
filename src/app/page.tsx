"use client";

import { useState, useEffect } from "react";
import HeaderBar from "@/components/import/HeaderBar";
import ListingTab from "@/components/import/ListingTab";
import ProductTab from "@/components/import/ProductTab";
import { useImportStore } from "@/stores/importStore";

export default function Home() {
  const [tab, setTab] = useState<"listing" | "product">("product");

  // Resume subscriptions on mount if running
  useEffect(() => {
    const { currentRequestId, status, startLogsForRequest, startResultsForRequest, startRunnerAutoCall } = useImportStore.getState();
    if (currentRequestId && (status === 'running' || status === 'parsing')) {
      startLogsForRequest(currentRequestId);
      startResultsForRequest(currentRequestId);
      startRunnerAutoCall();
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderBar activeTab={tab} onTabChange={setTab} />
      {tab === "listing" ? <ListingTab /> : <ProductTab />}
    </div>
  );
}
