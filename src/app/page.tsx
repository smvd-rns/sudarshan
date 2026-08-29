"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import YouTubeChannelHub from "@/components/YouTubeChannelHub";
import AuthUI from "@/components/AuthUI";
import { Loader2 } from "lucide-react";
import MantraLoader from "@/components/MantraLoader";

export default function PortalPage() {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [dbOffline, setDbOffline] = useState(false);
  const [checkingDb, setCheckingDb] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoadingAuth(false);
      })
      .catch(() => {
        setLoadingAuth(false);
        setDbOffline(true);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Check DB status so we know what to show guests
    async function checkDb() {
      try {
        const res = await fetch("/api/db-health");
        if (!res.ok) setDbOffline(true);
      } catch (err) {
        setDbOffline(true);
      } finally {
        setCheckingDb(false);
      }
    }
    checkDb();

    return () => subscription.unsubscribe();
  }, []);

  if (loadingAuth || checkingDb) {
    return <MantraLoader />;
  }

  if (!session) {
    // If DB is offline, don't show login form, show the public cached hub
    if (dbOffline) {
      return (
        <div className="min-h-screen bg-white">
          <Navbar />
          {/* Guest Mode Banner */}
          <div className="bg-amber-100 text-amber-800 px-4 py-2 text-center text-sm font-medium border-b border-amber-200">
            Database is currently offline. You are browsing in Guest Mode.
          </div>
          <main className="py-6 sm:py-12">
            <YouTubeChannelHub />
          </main>
        </div>
      );
    }
    
    // Otherwise show login (AuthGuard will redirect anyway, but just in case)
    return (
      <div className="min-h-screen bg-slate-50 py-20 flex flex-col items-center">
        <AuthUI redirectTo="/" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="py-6 sm:py-12">
        <YouTubeChannelHub />
      </main>
    </div>
  );
}
