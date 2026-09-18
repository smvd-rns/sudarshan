"use client";

import StoreGuard from "@/components/StoreGuard";
import StoreNav from "@/components/StoreNav";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreGuard>
      <div className="pb-16">
        <StoreNav />
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
    </StoreGuard>
  );
}
