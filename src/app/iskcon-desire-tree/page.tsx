"use client";

import React, { useState, useEffect, Suspense } from "react";
import IdktExplorer from "@/components/idkt/IdktExplorer";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";

export default function IskconDesireTreePage() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { profile } = useProfile(session);

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 to-white pt-6 sm:pt-10 pb-40 px-3 sm:px-6 lg:px-12">
        <div className="max-w-[1400px] mx-auto">
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center p-32 gap-4 bg-white/40 backdrop-blur-sm rounded-[3rem] border border-white/40 shadow-sm">
              <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Initialising Explorer...</p>
            </div>
          }>
            <IdktExplorer session={session} profile={profile} />
          </Suspense>
        </div>
      </div>
  );
}
