import { Suspense } from "react";
import AdminPanel from "@/components/AdminPanel";

export const metadata = {
  title: "Admin Dashboard - Spiritual Echoes",
};

export default function AdminPage() {
  return (
    <div className="pt-4">
      <Suspense fallback={<div className="p-10 text-center font-bold text-slate-400">Loading module...</div>}>
        <AdminPanel />
      </Suspense>
    </div>
  );
}
