"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bell, Clock, Loader2, Mail, RefreshCw } from "lucide-react";

interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  url: string;
  target_type: string;
  recipient_ids: string[];
  created_at: string;
}

/**
 * Notification history list — loads on page visit only.
 *
 * Log Ingestion Optimizations:
 * - Supabase Realtime WebSocket removed; data is fetched once on mount.
 * - Accepts userId and isManager as props (from parent useProfile hook)
 *   so no extra profiles DB query is needed here.
 * - A manual refresh button lets users pull latest without a persistent connection.
 */
export default function NotificationsHistoryList({
  limit = 10,
  userId,
  isManager,
}: {
  limit?: number;
  userId?: string | null;
  isManager?: boolean;
}) {
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      let query = supabase
        .from("notifications_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      // Privacy Filter: only restrict if NOT a manager
      if (!isManager && userId) {
        query = query.or(`target_type.eq.all,recipient_ids.cs.{"${userId}"}`);
      } else if (!userId) {
        query = query.eq('target_type', 'all');
      }

      const { data } = await query;
      if (data) setHistory(data);
    } catch (err) {
      console.error("History fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch once on mount (no WebSocket needed — this is a history list)
  useEffect(() => {
    fetchHistory();
  }, [userId, isManager, limit]);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-purple-200" />
        <p className="mt-4 text-slate-400 font-bold uppercase tracking-widest text-xs">Loading updates...</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem]">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Mail className="w-8 h-8 text-slate-200" />
        </div>
        <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-xs sm:text-sm italic">No recent broadcasts</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Manual refresh button — replaces the real-time WebSocket */}
      <div className="flex justify-end">
        <button
          onClick={() => fetchHistory(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-xl hover:bg-purple-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {history.map((item) => (
        <div
          key={item.id}
          className="group bg-white p-4 sm:p-8 rounded-[2rem] border-2 border-slate-100 transition-all hover:border-purple-200 hover:shadow-2xl hover:shadow-purple-500/5 hover:-translate-y-1 overflow-hidden"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="flex gap-3 sm:gap-5 items-start flex-1 min-w-0">
               <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-50 rounded-2xl flex items-center justify-center shrink-0 border border-purple-100 group-hover:bg-purple-600 group-hover:border-purple-600 transition-all duration-500">
                  <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 group-hover:text-white transition-colors" />
               </div>
               <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-purple-600">Announcement</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 hidden sm:block" />
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <h4 className="text-base sm:text-lg font-black font-outfit text-slate-900 tracking-tight leading-snug group-hover:text-purple-700 transition-colors break-words">
                    {item.title}
                  </h4>
                  <p className="text-xs sm:text-sm font-medium text-slate-500 mt-2 leading-relaxed break-all">
                    {item.body}
                  </p>
               </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
