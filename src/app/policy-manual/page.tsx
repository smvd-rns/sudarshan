"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import Navbar from "@/components/Navbar";
import PolicyManualView from "@/components/PolicyManualView";
import { Loader2, ShieldAlert } from "lucide-react";

export default function PolicyManualPage() {
  const [session, setSession] = useState<any>(null);
  const { profile, isBcdb, loading } = useProfile(session);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-devo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-12">
        {isBcdb ? (
          <PolicyManualView isEligible={isBcdb} email={session?.user?.email} />
        ) : (
          <div className="bg-white p-12 rounded-[2.5rem] shadow-xl border border-slate-200 text-center max-w-2xl mx-auto space-y-6 mt-20">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto shadow-lg">
              <ShieldAlert className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-black text-devo-950 uppercase tracking-tight">Access Restricted</h1>
            <p className="text-slate-500 font-bold leading-relaxed italic">
              "Authority is derived from character and service, yet compliance is the pillar of harmony."
            </p>
            <p className="text-slate-400 font-medium">
              The Policy Manual is only visible to verified Ashram members. If you believe this is an error, please contact the administrator.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
