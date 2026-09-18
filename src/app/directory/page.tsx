"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import DirectoryView from "@/components/DirectoryView";
import AccessDenied from "@/components/AccessDenied";
import { Loader2 } from "lucide-react";

export default function DirectoryPage() {
  const [session, setSession] = useState<any>(null);
  const { profile, isBcdb, isManager, isSuperAdmin, loading: profileLoading } = useProfile(session);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (profileLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Verifying Directory Clearance...</p>
      </div>
    );
  }

  const isAuthorized = isBcdb || isManager || isSuperAdmin;

  if (!isAuthorized) {
    return <AccessDenied />;
  }

  return (
    <div>
      <DirectoryView session={session} />
    </div>
  );
}
