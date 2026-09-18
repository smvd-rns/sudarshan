"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/hooks/useProfile";
import { Loader2, ShieldCheck, PlaneIcon, AlertCircle } from "lucide-react";
import TravelForm from "@/components/TravelForm";
import TravelAdminView from "@/components/TravelAdminView";
import AccessDenied from "@/components/AccessDenied";

export default function TravelDeskPage() {
  const [session, setSession] = useState<any>(null);
  const { profile, isBcdb, isManager, isSuperAdmin, loading, error, isTimeout, refreshProfile } = useProfile(session);

  useEffect(() => {
    const fetchSession = async () => {
      const { supabase } = await import("@/lib/supabase");
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
    };
    fetchSession();
  }, []);

  if (loading || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4 animate-pulse">
           <PlaneIcon className="w-8 h-8 text-emerald-500 animate-bounce" />
        </div>
        <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Verifying Travel Access...</p>
      </div>
    );
  }

  // Timeout View
  if (isTimeout) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-amber-50 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-xl shadow-amber-500/10 border border-amber-100">
           <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
        </div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter font-outfit uppercase">Connection Slow</h1>
        <p className="text-slate-400 mt-4 max-w-sm font-bold text-sm leading-relaxed">
           Your BCDB verification is taking longer than usual due to network instability.
        </p>
        <button 
          onClick={() => refreshProfile()}
          className="mt-8 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
        >
           Retry Verification
        </button>
      </div>
    );
  }

  // Admin / Manager View
  if (isManager || isSuperAdmin) {
    return <TravelAdminView session={session} profile={profile} />;
  }

  // BCDB User View
  if (isBcdb) {
    return <TravelForm session={session} profile={profile} />;
  }

  // Denied for others
  return (
    <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col items-center text-center">
       <div className="w-20 h-20 bg-red-50 rounded-[2rem] flex items-center justify-center mb-8 shadow-xl shadow-red-500/10 border border-red-100">
          <ShieldCheck className="w-10 h-10 text-red-500 opacity-20" />
          <AlertCircle className="w-10 h-10 text-red-500 absolute" />
       </div>
       <h1 className="text-4xl font-black text-slate-900 tracking-tighter font-outfit uppercase">Restricted Area</h1>
       <p className="text-slate-400 mt-4 max-w-sm font-bold text-sm leading-relaxed">
          The Travel Desk is only accessible to verified BCDB members and system managers.
       </p>
    </div>
  );
}
