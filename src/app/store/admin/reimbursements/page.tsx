"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, IndianRupee, Plus, X, Check, Search, Calendar, Trash2, Building, FileText, ArrowUpDown, RotateCcw, AlertTriangle } from "lucide-react";
import { useStoreAuth } from "@/components/StoreGuard";
import { PaginationControls } from "@/components/PaginationControls";

interface ReimbursementRecord {
  id: string;
  user_id: string;
  entry_date: string;
  item_details: string;
  amount: number;
  created_at: string;
  store_users?: {
    full_name: string;
    email: string;
    temple: string;
  };
}

interface ApprovedUser {
  id: string;
  full_name: string;
  email: string;
  temple: string;
  mobile: string;
}

export default function Reimbursements() {
  const [session, setSession] = useState<any>(null);
  const [requests, setRequests] = useState<ReimbursementRecord[]>([]);
  const [users, setUsers] = useState<ApprovedUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Table Search, Filter & Sort State
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [templeFilter, setTempleFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "name_asc" | "name_desc">("date_desc");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [datePreset, setDatePreset] = useState<"all" | "today" | "this_month" | "last_month" | "this_year" | "custom">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const applyDatePreset = (preset: "all" | "today" | "this_month" | "last_month" | "this_year") => {
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
    } else if (preset === "this_year") {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      setStartDate(start);
      setEndDate(end);
    }
  };

  // Add Reimbursement Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [entryDate, setEntryDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [itemDetails, setItemDetails] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userDropdownRef = useRef<HTMLDivElement>(null);

  const { storeUser, loading: authLoading } = useStoreAuth();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchApprovedRequests(session.access_token);
        fetchUsers(session.access_token);
      }
    });
  }, []);

  // Click outside listener for user dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchApprovedRequests = async (token: string) => {
    setLoading(true);
    const res = await fetch('/api/store/reimbursements', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      setRequests(data);
    }
    setLoading(false);
  };

  const fetchUsers = async (token: string) => {
    const res = await fetch('/api/store/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
  };

  // Unique Temples for Filter Dropdown
  const uniqueTemples = useMemo(() => {
    const set = new Set<string>();
    requests.forEach(r => {
      if (r.store_users?.temple) {
        set.add(r.store_users.temple);
      }
    });
    return Array.from(set).sort();
  }, [requests]);

  // Filter & Sort Logic
  const filteredRequests = useMemo(() => {
    let list = [...requests];

    // Search filter
    if (tableSearchQuery.trim()) {
      const q = tableSearchQuery.toLowerCase().trim();
      list = list.filter(r => {
        const name = (r.store_users?.full_name || "").toLowerCase();
        const email = (r.store_users?.email || "").toLowerCase();
        const temple = (r.store_users?.temple || "").toLowerCase();
        const details = (r.item_details || "").toLowerCase();
        const amountStr = (r.amount || 0).toString();
        const dateStr = (r.entry_date || r.created_at || "").toLowerCase();

        return name.includes(q) || email.includes(q) || temple.includes(q) || details.includes(q) || amountStr.includes(q) || dateStr.includes(q);
      });
    }

    // Temple filter
    if (templeFilter !== "all") {
      list = list.filter(r => (r.store_users?.temple || "") === templeFilter);
    }

    // Start Date Filter
    if (startDate) {
      list = list.filter(r => {
        const d = (r.entry_date || r.created_at || "").split('T')[0];
        return d >= startDate;
      });
    }

    // End Date Filter
    if (endDate) {
      list = list.filter(r => {
        const d = (r.entry_date || r.created_at || "").split('T')[0];
        return d <= endDate;
      });
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "date_desc") {
        const dateA = a.entry_date || a.created_at || "";
        const dateB = b.entry_date || b.created_at || "";
        return dateB.localeCompare(dateA);
      }
      if (sortBy === "date_asc") {
        const dateA = a.entry_date || a.created_at || "";
        const dateB = b.entry_date || b.created_at || "";
        return dateA.localeCompare(dateB);
      }
      if (sortBy === "amount_desc") {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }
      if (sortBy === "amount_asc") {
        return Number(a.amount || 0) - Number(b.amount || 0);
      }
      if (sortBy === "name_asc") {
        const nameA = (a.store_users?.full_name || "").trim();
        const nameB = (b.store_users?.full_name || "").trim();
        return nameA.localeCompare(nameB);
      }
      if (sortBy === "name_desc") {
        const nameA = (a.store_users?.full_name || "").trim();
        const nameB = (b.store_users?.full_name || "").trim();
        return nameB.localeCompare(nameA);
      }
      return 0;
    });

    return list;
  }, [requests, tableSearchQuery, templeFilter, sortBy, startDate, endDate]);

  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRequests.slice(start, start + pageSize);
  }, [filteredRequests, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [tableSearchQuery, templeFilter, sortBy, startDate, endDate, pageSize]);

  // Total sum of filtered amounts
  const totalFilteredAmount = useMemo(() => {
    return filteredRequests.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [filteredRequests]);

  const hasActiveFilters = tableSearchQuery.trim() !== "" || templeFilter !== "all" || sortBy !== "date_desc" || startDate !== "" || endDate !== "";

  const clearFilters = () => {
    setTableSearchQuery("");
    setTempleFilter("all");
    setSortBy("date_desc");
    setStartDate("");
    setEndDate("");
    setDatePreset("all");
    setPage(1);
    setPageSize(20);
  };

  const sortedUsersList = useMemo(() => {
    let list = users;
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.toLowerCase();
      list = users.filter(u => 
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.temple || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const nameA = (a.full_name || "").trim();
      const nameB = (b.full_name || "").trim();

      const isA_NA = !nameA || nameA.toUpperCase() === "N/A";
      const isB_NA = !nameB || nameB.toUpperCase() === "N/A";

      if (isA_NA && !isB_NA) return 1;
      if (!isA_NA && isB_NA) return -1;
      if (isA_NA && isB_NA) return 0;

      return nameA.localeCompare(nameB);
    });
  }, [users, userSearchQuery]);

  const openAddModal = () => {
    setIsModalOpen(true);
    setEntryDate(new Date().toISOString().split('T')[0]);
    setSelectedUserId("");
    setItemDetails("");
    setAmount("");
    setUserSearchQuery("");
    setIsUserDropdownOpen(false);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !selectedUserId || !itemDetails.trim() || !amount) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/store/reimbursements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          user_id: selectedUserId,
          date: entryDate,
          item_details: itemDetails,
          amount: parseFloat(amount)
        })
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchApprovedRequests(session.access_token);
      } else {
        const err = await res.json();
        alert("Error creating reimbursement entry: " + (err.error || "Failed to create"));
      }
    } catch (err: any) {
      alert("Failed to submit: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const executeDelete = async (id: string) => {
    if (!session) return;

    const res = await fetch(`/api/store/reimbursements?id=${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });

    if (res.ok) {
      setRequests(prev => prev.filter(r => r.id !== id));
    } else {
      const err = await res.json();
      alert("Error deleting record: " + (err.error || "Failed to delete"));
    }
  };

  if (authLoading || loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-devo-500" /></div>;

  const canAccessAdminPanel = storeUser?.can_access_admin_panel ?? storeUser?.is_super_or_store_admin;

  if (!canAccessAdminPanel) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-slate-200">
          <h2 className="text-xl font-bold text-amber-600 mb-2 font-outfit">Store Admin Access Required</h2>
          <p className="text-slate-600 text-xs sm:text-sm font-medium mb-6">
            Store Managers have access to the Approvals Queue only. This page is restricted to Store Admins.
          </p>
          <a href="/store/admin/approvals" className="inline-block px-5 py-2.5 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors text-xs sm:text-sm">
            Go to Approvals Queue
          </a>
        </div>
      </div>
    );
  }

  const selectedUserObj = users.find(u => u.id === selectedUserId);

  return (
    <div className="w-full pb-16">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black font-outfit text-slate-800 flex items-center gap-3">
            <IndianRupee className="w-8 h-8 text-amber-600" />
            Reimbursements & Issued Items
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Track issued catalog items and record manual reimbursement entries for devotees.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-md transition-all text-sm shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          Add Reimbursement Entry
        </button>
      </div>

      {/* Reimbursements Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4 w-full">
        {/* Card Header Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800 text-lg font-outfit">
              Reimbursement Ledger
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Showing <span className="font-bold text-slate-700">{filteredRequests.length}</span> of <span className="font-bold text-slate-700">{requests.length}</span> records
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="bg-amber-100 text-amber-900 text-xs font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
              <span>Total Reimbursements:</span>
              <span className="font-mono font-black text-amber-800 text-sm">₹{totalFilteredAmount.toFixed(2)}</span>
            </span>
          </div>
        </div>

        {/* Filter & Search Control Toolbar */}
        <div className="flex flex-col gap-2.5 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200/80">
          {/* Top Row: Search, Temple (1 row with Sort), Reset */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 sm:gap-3">
            {/* Search Box */}
            <div className="relative flex-1 w-full min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search devotee, email, details, temple..."
                value={tableSearchQuery}
                onChange={e => setTableSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:border-amber-500 shadow-2xs"
              />
              {tableSearchQuery && (
                <button
                  onClick={() => setTableSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Temple & Sort Filter in ONE Row on Mobile (Grid 2-Col) */}
            <div className="grid grid-cols-2 gap-2 w-full md:flex md:w-auto">
              {/* Temple Filter Dropdown */}
              <div className="relative min-w-0">
                <select
                  value={templeFilter}
                  onChange={e => setTempleFilter(e.target.value)}
                  className="w-full pl-7 pr-6 py-2 bg-white border border-slate-200 rounded-lg text-[11px] sm:text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 appearance-none shadow-2xs cursor-pointer truncate"
                >
                  <option value="all">All Temples ({requests.length})</option>
                  {uniqueTemples.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <Building className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Sort Dropdown */}
              <div className="relative min-w-0">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="w-full pl-7 pr-6 py-2 bg-white border border-slate-200 rounded-lg text-[11px] sm:text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 appearance-none shadow-2xs cursor-pointer truncate"
                >
                  <option value="date_desc">Date: Newest First</option>
                  <option value="date_asc">Date: Oldest First</option>
                  <option value="amount_desc">Amount: High-Low</option>
                  <option value="amount_asc">Amount: Low-High</option>
                  <option value="name_asc">Devotee: A to Z</option>
                  <option value="name_desc">Devotee: Z to A</option>
                </select>
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-lg flex items-center justify-center gap-1 border border-amber-200 transition-colors shrink-0"
                title="Reset search and filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>

          {/* Bottom Row: Date Range Selector & Presets */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-xs">
            {/* Quick Date Presets (Single Line, 4 Clean Buttons) */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-bold text-slate-600 flex items-center gap-1 mr-1 text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span>Date:</span>
              </span>
              <button
                type="button"
                onClick={() => applyDatePreset("all")}
                className={`px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-bold transition-all ${datePreset === "all" ? "bg-amber-600 text-white shadow-2xs" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset("today")}
                className={`px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-bold transition-all ${datePreset === "today" ? "bg-amber-600 text-white shadow-2xs" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset("this_month")}
                className={`px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-bold transition-all ${datePreset === "this_month" ? "bg-amber-600 text-white shadow-2xs" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset("last_month")}
                className={`px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-bold transition-all ${datePreset === "last_month" ? "bg-amber-600 text-white shadow-2xs" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
              >
                Last Month
              </button>
            </div>

            {/* Custom Date Range Pickers (2-Col Grid on Mobile, No Overflow!) */}
            <div className="grid grid-cols-2 gap-2 w-full lg:w-auto items-center">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[10px] font-semibold text-slate-500 shrink-0">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setDatePreset("custom");
                  }}
                  className="w-full min-w-0 px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] sm:text-xs font-medium text-slate-800 outline-none focus:border-amber-500 shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[10px] font-semibold text-slate-500 shrink-0">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    setDatePreset("custom");
                  }}
                  className="w-full min-w-0 px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] sm:text-xs font-medium text-slate-800 outline-none focus:border-amber-500 shadow-2xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Card View for Reimbursements */}
        <div className="block md:hidden space-y-2.5">
          {paginatedRequests.map((req, idx) => {
            const displayDate = req.entry_date || (req.created_at ? req.created_at.split('T')[0] : "");
            const numAmount = Number(req.amount || 0);
            const isEven = idx % 2 === 0;

            return (
              <div
                key={req.id}
                className={`rounded-xl border p-3 shadow-2xs space-y-2 transition-colors ${
                  isEven
                    ? "bg-white border-l-4 border-l-amber-600 border-slate-200/90"
                    : "bg-slate-50/90 border-l-4 border-l-teal-600 border-slate-300/80"
                }`}
              >
                {/* Top Row: Date, Manual Entry badge, Amount */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {displayDate ? new Date(displayDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                    </span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded uppercase">
                      Manual Entry
                    </span>
                  </div>

                  <span className="font-mono font-black text-slate-900 text-sm">
                    ₹{numAmount.toFixed(2)}
                  </span>
                </div>

                {/* Devotee Info & Item Details */}
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 text-xs truncate">
                      {req.store_users?.full_name || "Unknown"}
                    </span>
                    {req.store_users?.temple && (
                      <span className="text-[10px] text-slate-400 font-medium shrink-0">
                        Temple: {req.store_users.temple}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{req.store_users?.email}</div>

                  <div className="bg-slate-100/80 rounded-lg p-2 mt-1 border border-slate-200/60 font-black text-slate-900 text-xs whitespace-pre-wrap">
                    {req.item_details}
                  </div>
                </div>

                {/* Bottom Row: Actions */}
                <div className="flex items-center justify-end pt-1">
                  <button
                    onClick={() => handleDelete(req.id)}
                    className="px-2.5 py-1 text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Record
                  </button>
                </div>
              </div>
            );
          })}

          {filteredRequests.length === 0 && (
            <div className="p-8 text-center text-slate-400 font-medium bg-slate-50 rounded-xl border border-slate-200 text-xs">
              {hasActiveFilters ? "No reimbursement entries match your active search/filter criteria." : "No reimbursement records found."}
            </div>
          )}
        </div>

        {/* Desktop Table Data */}
        <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100/70 border-b border-slate-200">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Date</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Dev Name</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Item Details</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Type</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Amount</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRequests.map(req => {
                const displayDate = req.entry_date || (req.created_at ? req.created_at.split('T')[0] : "");
                const numAmount = Number(req.amount || 0);

                return (
                  <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 text-xs font-semibold text-slate-600 whitespace-nowrap">
                      {displayDate ? new Date(displayDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800 text-sm">{req.store_users?.full_name || "Unknown"}</div>
                      <div className="text-xs text-slate-500">{req.store_users?.email}</div>
                      {req.store_users?.temple && (
                        <div className="text-[10px] text-slate-400 mt-0.5">Temple: {req.store_users.temple}</div>
                      )}
                    </td>
                    <td className="p-4 text-xs">
                      <div className="font-bold text-slate-800 text-sm whitespace-pre-wrap">{req.item_details}</div>
                    </td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <span className="inline-block px-2.5 py-1 bg-amber-100 text-amber-800 font-bold rounded-lg text-[11px]">
                        Manual Entry
                      </span>
                    </td>
                    <td className="p-4 text-sm font-mono font-bold text-slate-800 text-right whitespace-nowrap">
                      ₹{numAmount.toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleDelete(req.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors mx-auto"
                        title="Delete Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 font-medium">
                    {hasActiveFilters ? "No reimbursement entries match your active search/filter criteria." : "No reimbursement records found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={page}
          pageSize={pageSize}
          totalItems={filteredRequests.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[20, 50, 100]}
        />
      </div>

      {/* Add Reimbursement Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 font-outfit">
                <IndianRupee className="w-5 h-5 text-amber-600" />
                Add Reimbursement / Manual Item
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              
              {/* Entry Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={e => setEntryDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-xs text-slate-800"
                />
              </div>

              {/* Devotee Name (Searchable Combobox) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-amber-600" />
                  Dev Name (Select Devotee)
                </label>
                
                {selectedUserObj ? (
                  /* Selected User Summary Card */
                  <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3 truncate">
                      <div className="w-8 h-8 rounded-full bg-amber-600 text-white font-bold text-xs flex items-center justify-center uppercase shrink-0 font-outfit">
                        {(selectedUserObj.full_name || selectedUserObj.email || "U").substring(0, 2)}
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-slate-800 text-xs truncate">{selectedUserObj.full_name || "N/A"}</div>
                        <div className="text-[11px] text-slate-500 truncate">{selectedUserObj.email}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUserId("");
                        setIsUserDropdownOpen(true);
                      }}
                      className="px-3 py-1.5 bg-white text-slate-700 hover:text-amber-700 hover:bg-slate-50 rounded-lg text-xs font-bold border border-slate-200 shadow-2xs shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  /* Search Combobox Input */
                  <div className="relative" ref={userDropdownRef}>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search devotee by name, email, temple..."
                        value={userSearchQuery}
                        onFocus={() => setIsUserDropdownOpen(true)}
                        onChange={e => {
                          setUserSearchQuery(e.target.value);
                          setIsUserDropdownOpen(true);
                        }}
                        className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-amber-500 focus:bg-white shadow-2xs transition-all"
                      />
                      {userSearchQuery && (
                        <button 
                          type="button"
                          onClick={() => setUserSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Scrollable User Options Box */}
                    {isUserDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1.5 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 space-y-1 z-50 custom-scrollbar">
                        {sortedUsersList.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400 font-medium">
                            No approved devotees match "{userSearchQuery}"
                          </div>
                        ) : (
                          sortedUsersList.map(u => (
                            <div
                              key={u.id}
                              onClick={() => {
                                setSelectedUserId(u.id);
                                setIsUserDropdownOpen(false);
                                setUserSearchQuery("");
                              }}
                              className="p-2.5 rounded-xl hover:bg-amber-50/80 cursor-pointer transition-colors flex items-center justify-between gap-3 text-xs select-none"
                            >
                              <div className="truncate pr-2">
                                <div className="font-bold text-slate-800 truncate">{u.full_name || "N/A"}</div>
                                <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                              </div>
                              {u.temple && (
                                <span className="inline-block bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                                  {u.temple}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Items Details */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-600" />
                  Items Details (Manual Description)
                </label>
                <textarea
                  required
                  rows={3}
                  value={itemDetails}
                  onChange={e => setItemDetails(e.target.value)}
                  placeholder="Enter manual item details (e.g. White Kurta set from local shop, Travel reimbursement for event...)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-xs text-slate-800 resize-none"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-amber-600" />
                  Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 500.00"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-xs text-slate-800"
                />
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  disabled={isSubmitting || !selectedUserId || !itemDetails.trim() || !amount}
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2 text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Reimbursement Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Popup Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-bold text-slate-800 text-base font-outfit">Remove Reimbursement Record?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Are you sure you want to remove this reimbursement entry? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = deleteConfirmId;
                  setDeleteConfirmId(null);
                  if (id) executeDelete(id);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors shadow-2xs"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
