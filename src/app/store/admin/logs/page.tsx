"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PaginationControls } from "@/components/PaginationControls";
import { 
  Activity, 
  Search, 
  RefreshCw, 
  Download, 
  Filter, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  Sparkles,
  Info,
  Calendar,
  AlertCircle
} from "lucide-react";

interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export default function StoreAdminLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  
  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAction, setSelectedAction] = useState("ALL");
  const [dateRange, setDateRange] = useState("ALL"); // ALL, TODAY, WEEK, MONTH
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchLogs = async (accessToken?: string) => {
    setLoading(true);
    setError(null);
    setTableMissing(false);
    try {
      let token = accessToken;
      if (!token) {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token;
      }

      if (!token) {
        setError("User authentication session not found");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/store/admin/logs", {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (data.tableMissing) {
          setTableMissing(true);
        }
        setError(data.error || "Failed to fetch activity logs");
        setLogs([]);
      } else {
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchLogs(session.access_token);
      } else {
        setLoading(false);
        setError("Please login to view activity logs");
      }
    });
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Action Filter
      if (selectedAction !== "ALL") {
        const act = (log.action || "").toUpperCase();
        if (selectedAction === "APPROVALS" && !["APPROVE_REQUEST", "REQUEST_APPROVED"].includes(act)) {
          return false;
        }
        if (selectedAction === "REJECTIONS" && !["REJECT_REQUEST", "REQUEST_REJECTED"].includes(act)) {
          return false;
        }
        if (selectedAction === "DELETE_REQUEST_HISTORY" && !["DELETE_REQUEST_HISTORY", "REJECT_DELETE_REQUEST"].includes(act)) {
          return false;
        }
        if (selectedAction === "USER_REQUESTS" && !["CREATE_REQUEST", "REQUEST_SUBMITTED"].includes(act)) {
          return false;
        }
        if (selectedAction === "PUBLIC_REQUESTS" && !["PUBLIC_REQUEST_SUBMITTED"].includes(act)) {
          return false;
        }
        if (selectedAction === "ITEM_CREATED" && !["ITEM_CREATED"].includes(act)) {
          return false;
        }
        if (selectedAction === "ITEM_UPDATED" && !["ITEM_UPDATED", "UPDATE_REQUEST"].includes(act)) {
          return false;
        }
        if (selectedAction === "ITEM_DELETED" && !["ITEM_DELETED"].includes(act)) {
          return false;
        }
        if (selectedAction === "REIMBURSEMENT_ADDED" && !["REIMBURSEMENT_ADDED"].includes(act)) {
          return false;
        }
        if (selectedAction === "REIMBURSEMENT_DELETED" && !["REIMBURSEMENT_DELETED"].includes(act)) {
          return false;
        }
      }

      // Date Filter
      if (dateRange !== "ALL") {
        const logDate = new Date(log.created_at);
        const now = new Date();
        if (dateRange === "TODAY") {
          if (logDate.toDateString() !== now.toDateString()) return false;
        } else if (dateRange === "WEEK") {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (logDate < sevenDaysAgo) return false;
        } else if (dateRange === "MONTH") {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (logDate < thirtyDaysAgo) return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const nameMatch = log.user_name?.toLowerCase().includes(query) || false;
        const emailMatch = log.user_email?.toLowerCase().includes(query) || false;
        const actionMatch = log.action?.toLowerCase().includes(query) || false;
        const detailsMatch = log.details?.toLowerCase().includes(query) || false;
        return nameMatch || emailMatch || actionMatch || detailsMatch;
      }

      return true;
    });
  }, [logs, selectedAction, dateRange, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedAction, dateRange, pageSize]);

  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page, pageSize]);

  const stats = useMemo(() => {
    const total = logs.length;
    const todayStr = new Date().toDateString();
    let todayCount = 0;
    let approvalsCount = 0;
    let quickRequestsCount = 0;

    logs.forEach(l => {
      const d = new Date(l.created_at);
      if (d.toDateString() === todayStr) todayCount++;
      const act = (l.action || "").toUpperCase();
      if (["APPROVE_REQUEST", "REQUEST_APPROVED"].includes(act)) approvalsCount++;
      if (["PUBLIC_REQUEST_SUBMITTED", "CREATE_REQUEST", "REQUEST_SUBMITTED"].includes(act)) quickRequestsCount++;
    });

    return { total, todayCount, approvalsCount, quickRequestsCount };
  }, [logs]);

  const getActionBadge = (action: string) => {
    const act = (action || "").toUpperCase();
    switch (act) {
      case "APPROVE_REQUEST":
      case "REQUEST_APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Approved
          </span>
        );
      case "REJECT_REQUEST":
      case "REQUEST_REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Rejected
          </span>
        );
      case "DELETE_REQUEST_HISTORY":
      case "REJECT_DELETE_REQUEST":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-300">
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            Request Deleted
          </span>
        );
      case "PUBLIC_REQUEST_SUBMITTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            Quick Request
          </span>
        );
      case "CREATE_REQUEST":
      case "REQUEST_SUBMITTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            User Request
          </span>
        );
      case "ITEM_CREATED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <PlusCircle className="w-3.5 h-3.5 text-sky-600" />
            Item Created
          </span>
        );
      case "ITEM_UPDATED":
      case "UPDATE_REQUEST":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Edit3 className="w-3.5 h-3.5 text-amber-600" />
            Updated
          </span>
        );
      case "ITEM_DELETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Trash2 className="w-3.5 h-3.5 text-slate-600" />
            Item Deleted
          </span>
        );
      case "REIMBURSEMENT_ADDED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <PlusCircle className="w-3.5 h-3.5 text-indigo-600" />
            Reimbursement
          </span>
        );
      case "REIMBURSEMENT_DELETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Trash2 className="w-3.5 h-3.5 text-slate-600" />
            Reimbursement Del
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {action}
          </span>
        );
    }
  };

  const exportCSV = () => {
    if (!filteredLogs.length) return;
    const headers = ["Timestamp", "User Name", "User Email", "Action", "Details"];
    const rows = filteredLogs.map(l => [
      new Date(l.created_at).toLocaleString(),
      l.user_name || "",
      l.user_email || "",
      l.action,
      `"${(l.details || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `store_activity_logs_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sqlSetupInstructions = `
CREATE TABLE IF NOT EXISTS public.store_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_name TEXT,
    user_email TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_activity_logs_created_at ON public.store_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_activity_logs_action ON public.store_activity_logs(action);
  `.trim();

  return (
    <div className="w-full pb-16">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-700">
                <Activity className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Store Activity Logs
              </h1>
            </div>
            <p className="text-slate-500 text-sm max-w-2xl">
              Real-time audit log tracking who performed operations, what changes were made, and exact timestamps across all store requests, approvals, catalog edits, and reimbursements.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => fetchLogs()}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={exportCSV}
              disabled={!filteredLogs.length}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition-all shadow-sm shadow-amber-600/20 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* Card 1: Total Logs */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs flex items-center gap-3.5 transition-all hover:shadow-md">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Total Audit Logs</p>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 font-mono leading-tight">{stats.total.toLocaleString()}</h3>
          </div>
        </div>

        {/* Card 2: Today's Logs */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs flex items-center gap-3.5 transition-all hover:shadow-md">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-500/10 text-blue-700 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Logged Today</p>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 font-mono leading-tight">{stats.todayCount.toLocaleString()}</h3>
          </div>
        </div>

        {/* Card 3: Approvals */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs flex items-center gap-3.5 transition-all hover:shadow-md">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Total Approvals</p>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 font-mono leading-tight">{stats.approvalsCount.toLocaleString()}</h3>
          </div>
        </div>

        {/* Card 4: Requests Created */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs flex items-center gap-3.5 transition-all hover:shadow-md">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-violet-500/10 text-violet-700 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Requests Logged</p>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 font-mono leading-tight">{stats.quickRequestsCount.toLocaleString()}</h3>
          </div>
        </div>
      </div>

      {/* Table Missing Warning */}
      {tableMissing && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-bold text-amber-900 mb-1">
                Database Table `store_activity_logs` Not Created Yet
              </h3>
              <p className="text-xs text-amber-800 mb-3">
                The audit log system is active in code. To persist logs in Supabase, please run this quick SQL script in your Supabase SQL Editor:
              </p>
              <pre className="bg-amber-900/90 text-amber-100 p-4 rounded-xl text-xs font-mono overflow-x-auto select-all mb-2">
                {sqlSetupInstructions}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/80 shadow-xs mb-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3">
          {/* Search */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search user, action, details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-2xs"
            />
          </div>

          {/* Action Filter */}
          <div className="md:col-span-4 relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 appearance-none cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Actions</option>
              <option value="USER_REQUESTS">User Requests (Standard)</option>
              <option value="PUBLIC_REQUESTS">Quick Requests (Public)</option>
              <option value="APPROVALS">Approvals</option>
              <option value="REJECTIONS">Rejections (Queue)</option>
              <option value="DELETE_REQUEST_HISTORY">Request History Deleted</option>
              <option value="ITEM_CREATED">Catalog Item Created</option>
              <option value="ITEM_UPDATED">Catalog Item Updated</option>
              <option value="ITEM_DELETED">Catalog Item Deleted</option>
              <option value="REIMBURSEMENT_ADDED">Reimbursements Added</option>
              <option value="REIMBURSEMENT_DELETED">Reimbursements Deleted</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="md:col-span-3 relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 appearance-none cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today Only</option>
              <option value="WEEK">Last 7 Days</option>
              <option value="MONTH">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 text-amber-600 animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">Loading store activity logs...</p>
          </div>
        ) : error && !tableMissing ? (
          <div className="p-12 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
            <p className="text-slate-800 text-sm font-bold mb-1">Failed to load logs</p>
            <p className="text-slate-500 text-xs">{error}</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-800 text-sm font-bold mb-1">No Activity Logs Found</p>
            <p className="text-slate-500 text-xs">
              {searchTerm || selectedAction !== "ALL" || dateRange !== "ALL"
                ? "Try adjusting your search filters above."
                : "No operations have been logged yet."}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile / Tablet Compact Open Card View */}
            <div className="block md:hidden divide-y divide-slate-100">
              {paginatedLogs.map((log) => {
                const formattedDate = new Date(log.created_at).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true
                });

                return (
                  <div key={log.id} className="p-3.5 sm:p-4 hover:bg-slate-50/80 transition-colors space-y-2.5">
                    {/* Top: Performer Avatar + Name/Email & Action Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-700 text-xs shrink-0 border border-slate-200 shadow-2xs">
                          {(log.user_name || log.user_email || "U")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 text-xs sm:text-sm leading-tight truncate">
                            {log.user_name || "Unknown User"}
                          </h4>
                          {log.user_email && (
                            <p className="text-[10px] text-slate-400 truncate">{log.user_email}</p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {getActionBadge(log.action)}
                      </div>
                    </div>

                    {/* Middle: Activity Details */}
                    <p className="text-xs text-slate-700 leading-relaxed font-normal bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/60">
                      {log.details || "No details recorded."}
                    </p>

                    {/* Bottom: Timestamp */}
                    <div className="flex items-center justify-end gap-1 text-[10px] font-mono text-slate-400 font-medium pt-0.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formattedDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Data Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-black">When</th>
                    <th className="py-3.5 px-4 font-black">Who (Performed By)</th>
                    <th className="py-3.5 px-4 font-black">Action</th>
                    <th className="py-3.5 px-4 font-black">Activity Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {paginatedLogs.map((log) => {
                    const formattedDate = new Date(log.created_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true
                    });

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {formattedDate}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0 border border-slate-200">
                              {(log.user_name || log.user_email || "U")[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 leading-tight">
                                {log.user_name || "Unknown User"}
                              </p>
                              {log.user_email && (
                                <p className="text-[10px] text-slate-400">{log.user_email}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {getActionBadge(log.action)}
                        </td>
                        <td className="py-3.5 px-4 max-w-md">
                          <p className="text-slate-800 leading-relaxed font-normal">
                            {log.details || "No details recorded."}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-100">
              <PaginationControls
                currentPage={page}
                pageSize={pageSize}
                totalItems={filteredLogs.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[20, 50, 100]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
