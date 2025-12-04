"use client";

import { useState, useEffect } from "react";
import HeaderBar from "@/components/import/HeaderBar";
import ListingTab from "@/components/import/ListingTab";
import ProductTab from "@/components/import/ProductTab";
import { useImportStore } from "@/stores/importStore";

export default function Home() {
  const [tab, setTab] = useState<"listing" | "product">("product");

  // Resume subscriptions on mount if running, or fetch results if missing
  useEffect(() => {
    const st = useImportStore.getState();
    const hasRequest = !!st.currentRequestId;
    const isRunning = st.status === 'running' || st.status === 'parsing';
    const emptyResults = st.results.length === 0;

    if (hasRequest) {
      if (isRunning) {
        st.startLogsForRequest(st.currentRequestId!);
        st.startResultsForRequest(st.currentRequestId!, false);
        st.startRunnerAutoCall();
      } else if (emptyResults) {
        st.startResultsForRequest(st.currentRequestId!, false);
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderBar activeTab={tab} onTabChange={setTab} />
      {tab === "listing" ? <ListingTab /> : <ProductTab />}
    </div>
  );
}
