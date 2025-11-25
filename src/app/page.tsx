"use client";

import { useState } from "react";
import HeaderBar from "@/components/import/HeaderBar";
import ListingTab from "@/components/import/ListingTab";
import ProductTab from "@/components/import/ProductTab";

export default function Home() {
  const [tab, setTab] = useState<"listing" | "product">("product");

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderBar activeTab={tab} onTabChange={setTab} />
      {tab === "listing" ? <ListingTab /> : <ProductTab />}
    </div>
  );
}
