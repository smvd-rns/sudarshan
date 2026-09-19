"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, History, User, ShieldCheck, Clock, Package, IndianRupee, Users, Activity } from "lucide-react";
import { useStoreAuth } from "@/components/StoreGuard";

export default function StoreNav() {
  const pathname = usePathname();
  const { storeUser } = useStoreAuth();

  const isRequest = pathname === "/store/request" || pathname === "/store";
  const isHistory = pathname === "/store/history";
  const isProfile = pathname === "/store/profile";
  const isAdmin = pathname.startsWith("/store/admin");

  const isApprovals = pathname === "/store/admin/approvals" || pathname === "/store/admin";
  const isItems = pathname === "/store/admin/items";
  const isReimbursements = pathname === "/store/admin/reimbursements";
  const isUsers = pathname === "/store/admin/users";
  const isLogs = pathname === "/store/admin/logs";

  const canAccessApprovals = storeUser?.can_access_approvals ?? (storeUser?.is_store_admin || storeUser?.is_super_or_store_admin);
  const canAccessAdminPanel = storeUser?.can_access_admin_panel ?? storeUser?.is_super_or_store_admin;

  return (
    <div className="bg-white border-b border-slate-200/80 mb-4 sm:mb-8 shadow-2xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Main Store Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-2.5 sm:py-3 no-scrollbar scroll-smooth">
          {/* Mobile View Only: Approvals Queue Button placed BEFORE Request Items */}
          {canAccessApprovals && (
            <Link
              href="/store/admin/approvals"
              className={`sm:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
                isApprovals
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/20 scale-[1.02]"
                  : "bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100"
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${isApprovals ? "text-white" : "text-amber-600"}`} />
              <span>Approvals Queue</span>
            </Link>
          )}

          <Link
            href="/store/request"
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap shrink-0 ${
              isRequest
                ? "bg-teal-600 text-white shadow-md shadow-teal-600/20 scale-[1.02]"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Request Items</span>
          </Link>

          <Link
            href="/store/history"
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap shrink-0 ${
              isHistory
                ? "bg-teal-600 text-white shadow-md shadow-teal-600/20 scale-[1.02]"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
            }`}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Request History</span>
          </Link>

          <Link
            href="/store/profile"
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap shrink-0 ${
              isProfile
                ? "bg-teal-600 text-white shadow-md shadow-teal-600/20 scale-[1.02]"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
            }`}
          >
            <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>My Profile</span>
          </Link>

          {/* Store Admin & Laptop/Tablet Approvals Queue buttons (Role-based access) */}
          {(canAccessApprovals || canAccessAdminPanel) && (
            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
              {canAccessApprovals && (
                <Link
                  href="/store/admin/approvals"
                  className={`hidden sm:flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap shrink-0 ${
                    isApprovals
                      ? "bg-amber-600 text-white shadow-md shadow-amber-600/20 scale-[1.02]"
                      : "bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100"
                  }`}
                >
                  <Clock className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isApprovals ? "text-white" : "text-amber-600"}`} />
                  <span>Approvals Queue</span>
                </Link>
              )}

              {canAccessAdminPanel && (
                <Link
                  href="/store/admin/items"
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap shrink-0 ${
                    isAdmin && !isApprovals
                      ? "bg-amber-600 text-white shadow-md shadow-amber-600/20 scale-[1.02]"
                      : "bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100"
                  }`}
                >
                  <ShieldCheck className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isAdmin && !isApprovals ? "text-white" : "text-amber-600"}`} />
                  <span>Store Admin</span>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Store Admin Tools Sub-Navigation */}
        {isAdmin && !isApprovals && canAccessAdminPanel && (
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-2 border-t border-slate-100 no-scrollbar scroll-smooth">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 mr-1 shrink-0">Admin Tools:</span>
            
            <Link
              href="/store/admin/items"
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
                isItems
                  ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-xs"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Package className="w-3.5 h-3.5 text-amber-600" />
              <span>Catalog Items</span>
            </Link>

            <Link
              href="/store/admin/reimbursements"
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
                isReimbursements
                  ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-xs"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <IndianRupee className="w-3.5 h-3.5 text-amber-600" />
              <span>Reimbursements</span>
            </Link>

            <Link
              href="/store/admin/users"
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
                isUsers
                  ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-xs"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-amber-600" />
              <span>User Management</span>
            </Link>

            <Link
              href="/store/admin/logs"
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
                isLogs
                  ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-xs"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-amber-600" />
              <span>Activity Logs</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}



