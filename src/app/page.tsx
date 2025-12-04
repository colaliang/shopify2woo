"use client";

import { useState, useEffect } from "react";
import HeaderBar from "@/components/import/HeaderBar";
import ListingTab from "@/components/import/ListingTab";
import ProductTab from "@/components/import/ProductTab";
import { useImportStore } from "@/stores/importStore";

export default function Home() {
  const [tab, setTab] = useState<"listing" | "product">("product");
  const { currentRequestId, status, results } = useImportStore();

  // Resume subscriptions on mount if running, or fetch results if missing
  useEffect(() => {
    const st = useImportStore.getState();
    const hasRequest = !!currentRequestId;
    const isRunning = status === 'running' || status === 'parsing';
    const emptyResults = results.length === 0;

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

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderBar activeTab={tab} onTabChange={setTab} />
      {tab === "listing" ? <ListingTab /> : <ProductTab />}
    </div>
  );
}
