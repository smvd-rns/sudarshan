"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  History,
  Trash2,
  IndianRupee,
  AlertTriangle,
  Package,
  Search,
  X,
  Filter,
  ArrowUpDown,
  RotateCcw,
  CheckCircle,
  Clock,
  XCircle
} from "lucide-react";
import { useStoreAuth } from "@/components/StoreGuard";
import { PaginationControls } from "@/components/PaginationControls";

interface HistoryRecord {
  id: string;
  type: 'request' | 'reimbursement';
  created_at: string;
  item_name: string;
  variant_or_amount: string;
  quantity: number;
  status: string;
}

export default function StoreHistory() {
  const [session, setSession] = useState<any>(null);
  const [historyItems, setHistoryItems] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search, Filter & Sort States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "request" | "reimbursement">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "name_asc" | "qty_desc">("date_desc");
  const [datePreset, setDatePreset] = useState<"all" | "today" | "this_month" | "last_month">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { storeUser, loading: authLoading } = useStoreAuth();

  // Custom confirmation modal state for deletion
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<HistoryRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = !!storeUser?.is_super_or_store_admin;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchHistory(session.access_token);
      else setLoading(false);
    });
  }, []);

  const fetchHistory = async (token: string) => {
    setLoading(true);
    try {
      const [reqRes, reimRes] = await Promise.all([
        fetch('/api/store/requests?mode=mine', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/store/reimbursements?mode=mine', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const formatted: HistoryRecord[] = [];

      if (reqRes.ok) {
        const reqData = await reqRes.json();
        (reqData || []).forEach((r: any) => {
          let isReim = false;
          let iName = r.store_items?.item_name || "N/A";
          let vText = r.selected_variant || "-";

          if (r.selected_variant) {
            try {
              const parsed = JSON.parse(r.selected_variant);
              if (parsed && typeof parsed === "object") {
                if (parsed.snapshot_item_name || parsed.item_name) {
                  iName = parsed.snapshot_item_name || parsed.item_name;
                }
                if (parsed.isReimbursement) {
                  isReim = true;
                  iName = parsed.item_details || "Reimbursement Entry";
                  vText = `Amount: ₹${Number(parsed.amount || 0).toFixed(2)}`;
                } else if (parsed.variant) {
                  vText = parsed.variant;
                } else if (parsed.label) {
                  vText = parsed.label;
                }
              }
            } catch (e) {}
          }

          formatted.push({
            id: r.id,
            type: isReim ? 'reimbursement' : 'request',
            created_at: r.created_at,
            item_name: iName,
            variant_or_amount: vText,
            quantity: r.quantity || 1,
            status: r.status || 'pending'
          });
        });
      }

      if (reimRes.ok) {
        const reimData = await reimRes.json();
        (reimData || []).forEach((rm: any) => {
          formatted.push({
            id: rm.id,
            type: 'reimbursement',
            created_at: rm.entry_date || rm.created_at,
            item_name: rm.item_details || "Manual Reimbursement",
            variant_or_amount: `Amount: ₹${Number(rm.amount || 0).toFixed(2)}`,
            quantity: 1,
            status: 'approved'
          });
        });
      }

      // Sort merged history by date descending
      formatted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHistoryItems(formatted);

    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setLoading(false);
    }
  };

  // Format variant or amount text
  const formatVariantOrAmount = (vText: string, isReimbursement: boolean) => {
    if (isReimbursement) {
      if (isAdmin) return vText;
      return "Reimbursement";
    }

    if (!vText || vText === "-") return "";

    if (!isAdmin) {
      const cleaned = vText
        .replace(/\s*[-—:]\s*₹?\s*\d+(\.\d+)?/gi, "")
        .replace(/\s*\(\s*₹?\s*\d+(\.\d+)?\s*\)/gi, "")
        .replace(/₹\s*\d+(\.\d+)?/gi, "")
        .trim();
      return cleaned || "";
    }

    return vText;
  };

  // Preset Date Filter Handler
  const applyDatePreset = (preset: "all" | "today" | "this_month" | "last_month") => {
    setDatePreset(preset);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      const todayStr = now.toISOString().split("T")[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "this_month") {
      const start = new Date(year, month, 1).toISOString().split("T")[0];
      const end = new Date(year, month + 1, 0).toISOString().split("T")[0];
      setStartDate(start);
      setEndDate(end);
    } else if (preset === "last_month") {
      const start = new Date(year, month - 1, 1).toISOString().split("T")[0];
      const end = new Date(year, month, 0).toISOString().split("T")[0];
      setStartDate(start);
      setEndDate(end);
    }
  };

  // Memoized Filtered & Sorted History
  const filteredHistoryItems = useMemo(() => {
    let list = [...historyItems];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => {
        const formattedVar = formatVariantOrAmount(item.variant_or_amount, item.type === 'reimbursement').toLowerCase();
        return item.item_name.toLowerCase().includes(q) || formattedVar.includes(q);
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter(item => item.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== "all") {
      list = list.filter(item => item.type === typeFilter);
    }

    // Date range filter
    if (startDate) {
      list = list.filter(item => item.created_at.split('T')[0] >= startDate);
    }
    if (endDate) {
      list = list.filter(item => item.created_at.split('T')[0] <= endDate);
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "date_desc") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "date_asc") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === "name_asc") {
        return a.item_name.localeCompare(b.item_name);
      }
      if (sortBy === "qty_desc") {
        return (b.quantity || 1) - (a.quantity || 1);
      }
      return 0;
    });

    return list;
  }, [historyItems, searchQuery, statusFilter, typeFilter, startDate, endDate, sortBy, isAdmin]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, typeFilter, startDate, endDate, sortBy, pageSize]);

  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "all" || typeFilter !== "all" || datePreset !== "all" || startDate !== "" || endDate !== "" || sortBy !== "date_desc";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setSortBy("date_desc");
    setDatePreset("all");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const paginatedHistoryItems = useMemo(() => {
    return filteredHistoryItems.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredHistoryItems, page, pageSize]);

  const executeDelete = async () => {
    if (!deleteConfirmItem || !session) return;
    setIsDeleting(true);

    const item = deleteConfirmItem;
    const endpoint = item.type === 'reimbursement' 
      ? `/api/store/reimbursements?id=${item.id}` 
      : `/api/store/requests?id=${item.id}`;

    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });

    if (res.ok) {
      setHistoryItems(prev => prev.filter(r => r.id !== item.id));
      setDeleteConfirmItem(null);
    } else {
      const err = await res.json().catch(() => ({}));
      alert("Error deleting record: " + (err.error || "Failed to delete"));
    }
    setIsDeleting(false);
  };

  if (authLoading || loading) {
    return (
      <div className="p-10 text-center">
        <Loader2 className="animate-spin mx-auto text-amber-600" />
      </div>
    );
  }

  return (
    <div className="w-full pb-16 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black font-outfit text-slate-800 flex items-center gap-2.5">
            <History className="w-6 h-6 sm:w-7 sm:h-7 text-amber-600 shrink-0" />
            <span>My Request & Reimbursement History</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            View all your past item requests, selected varieties, and status updates.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
            <span>Total Records:</span>
            <span className="font-mono font-black text-amber-700">{filteredHistoryItems.length}</span>
          </span>
        </div>
      </div>
        
      {/* Main Content Container */}
      <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-3 sm:p-5 space-y-4">
        
        {/* Search, Filter & Sort Toolbar */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2.5">
          {/* Top Row: Single-Line Toolbar for Mobile (Search + Status + Sort) */}
          <div className="flex flex-row items-center gap-1.5 w-full">
            {/* Search Box */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:border-amber-500 shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="relative w-24 sm:w-32 shrink-0">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="relative w-24 sm:w-32 shrink-0">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="date_desc">Newest</option>
                <option value="date_asc">Oldest</option>
                <option value="name_asc">Name A-Z</option>
                <option value="qty_desc">Qty High</option>
              </select>
            </div>
          </div>

          {/* Bottom Row: Date Quick Presets & Clear Filters */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2 text-xs">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase mr-1 shrink-0">Range:</span>
              {[
                { id: "all", label: "All Time" },
                { id: "today", label: "Today" },
                { id: "this_month", label: "This Month" },
                { id: "last_month", label: "Last Month" }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => applyDatePreset(p.id as any)}
                  className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition-all whitespace-nowrap cursor-pointer ${
                    datePreset === p.id
                      ? "bg-amber-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-md flex items-center gap-1 border border-amber-200 transition-colors shrink-0"
                title="Reset search and filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Compact Single-Line Card View (< 768px) */}
        <div className="block md:hidden space-y-2">
          {paginatedHistoryItems.map((item, idx) => {
            const formattedVar = formatVariantOrAmount(item.variant_or_amount, item.type === 'reimbursement');
            const displayDate = new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs shadow-2xs hover:border-slate-300 transition-all"
              >
                {/* Single-Line Left Side: Date + Item Name + Variety */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 uppercase tracking-tight">
                    {displayDate}
                  </span>
                  <span className="text-slate-300 shrink-0">•</span>
                  
                  <div className="font-bold text-slate-800 text-xs min-w-0 truncate flex items-center gap-1">
                    <span className="truncate">{item.item_name}</span>
                    {formattedVar && formattedVar !== "-" && (
                      <span className="text-slate-500 font-semibold text-[11px] truncate shrink-0">
                        ({formattedVar})
                      </span>
                    )}
                  </div>
                </div>

                {/* Single-Line Right Side: Quantity + Status Badge */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono font-black text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    Qty: {item.quantity}
                  </span>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    item.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                    item.status === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                    'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {item.status}
                  </span>
                </div>
              </div>
            );
          })}

          {filteredHistoryItems.length === 0 && (
            <div className="p-8 text-center text-slate-400 font-medium bg-slate-50 rounded-xl border border-slate-200 text-xs">
              {hasActiveFilters ? "No request history matches your active filter criteria." : "No past request history found."}
            </div>
          )}
        </div>

        {/* Desktop Table View (>= 768px) */}
        <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100/70 border-b border-slate-200">
              <tr>
                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase">Date</th>
                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase">Item / Details</th>
                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase">{isAdmin ? "Variant / Amount" : "Variety / Size"}</th>
                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase text-center">Qty</th>
                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistoryItems.map(item => {
                const formattedVar = formatVariantOrAmount(item.variant_or_amount, item.type === 'reimbursement');
                return (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="p-3.5 text-sm font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <span>{item.item_name}</span>
                        {item.type === 'reimbursement' && (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                            {isAdmin && <IndianRupee className="w-2.5 h-2.5" />}
                            Reimbursement
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 text-xs font-semibold text-slate-600">{formattedVar || "-"}</td>
                    <td className="p-3.5 text-xs font-mono font-bold text-slate-800 text-center">{item.quantity}</td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        item.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        item.status === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                        'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredHistoryItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400 font-medium text-xs">
                    {hasActiveFilters ? "No request history matches your active filter criteria." : "No past request history found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="pt-2 border-t border-slate-100">
          <PaginationControls
            currentPage={page}
            pageSize={pageSize}
            totalItems={filteredHistoryItems.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[20, 50, 100]}
          />
        </div>
      </div>

      {/* Delete Confirmation Popup Modal */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-bold text-slate-800 text-base font-outfit">Delete History Record?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Are you sure you want to delete "{deleteConfirmItem.item_name}" from your history?
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executeDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
