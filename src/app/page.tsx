"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import YouTubeChannelHub from "@/components/YouTubeChannelHub";
import AuthUI from "@/components/AuthUI";
import MantraLoader from "@/components/MantraLoader";

export default function PortalPage() {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoadingAuth(false);
      })
      .catch(() => {
        setLoadingAuth(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loadingAuth) {
    return <MantraLoader />;
  }

  if (!session) {
    // AuthGuard handles offline mode and redirection for the whole app.
    // Here we just show login if not authenticated.
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
