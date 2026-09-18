"use client";

import React, { useState } from "react";
import { Loader2, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function StoreSyncManager({ session }: { session: any }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const runSync = async () => {
    if (!confirm("This will synchronize all users and BCDB access to the IDKT Store database. Continue?")) return;
    
    setIsSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/store-sync", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ type: 'success', message: data.message });
      } else {
        setResult({ type: 'error', message: data.error || "Failed to sync" });
      }
    } catch (err: any) {
      setResult({ type: 'error', message: "Network error occurred." });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <div className="bg-white rounded-3xl p-8 border-2 border-slate-200 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-teal-100 rounded-2xl flex items-center justify-center text-teal-600 mb-6 shadow-sm border border-teal-200">
            <RefreshCw className={`w-10 h-10 ${isSyncing ? 'animate-spin' : ''}`} />
          </div>
          
          <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Store Database Sync</h2>
          <p className="text-slate-500 font-medium mb-8 max-w-lg">
            Synchronize user profiles and BCDB access lists from the Main database to the IDKT Store database. This process updates user details and access flags.
          </p>

          {result && (
            <div className={`mb-8 p-4 rounded-xl border flex items-start gap-3 text-left w-full max-w-md ${result.type === 'success' ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              {result.type === 'success' ? <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" /> : <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />}
              <span className="font-bold text-sm leading-relaxed">{result.message}</span>
            </div>
          )}

          <button
            onClick={runSync}
            disabled={isSyncing}
            className="px-8 py-4 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg hover:shadow-teal-600/30 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-3"
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Syncing Databases...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Run Full Sync Now
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
