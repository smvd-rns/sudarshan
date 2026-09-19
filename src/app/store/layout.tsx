"use client";

import { usePathname } from "next/navigation";
import StoreGuard from "@/components/StoreGuard";
import StoreNav from "@/components/StoreNav";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/store/quick-request")) {
    return <>{children}</>;
  }

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

