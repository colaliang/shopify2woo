"use client";

import HeaderBar from "@/components/import/HeaderBar";
import { useRouter } from "next/navigation";

export default function BlogHeader() {
  const router = useRouter();

  return (
    <HeaderBar
      activeTab="blog"
      onTabChange={(tab) => {
        if (tab === "product") {
          router.push("/");
        }
      }}
    />
  );
}
