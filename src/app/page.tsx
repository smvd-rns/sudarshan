"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import YouTubeChannelHub from "@/components/YouTubeChannelHub";
import AuthUI from "@/components/AuthUI";
import MantraLoader from "@/components/MantraLoader";

export default function PortalPage() {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // 3-second fallback timeout to prevent MantraLoader from hanging if Supabase is offline/unhealthy
    const timeoutId = setTimeout(() => {
      console.warn("Auth session check timed out on PortalPage. Enabling offline access mode.");
      setIsOffline(true);
      setLoadingAuth(false);
    }, 3000);

    // Also check if offline event / cached offline state exists
    if (typeof window !== "undefined" && (!navigator.onLine || localStorage.getItem("db_health_status") === null)) {
      setIsOffline(true);
    }

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeoutId);
        setSession(session);
        setLoadingAuth(false);
      })
      .catch((err) => {
        console.warn("getSession error on PortalPage:", err);
        clearTimeout(timeoutId);
        setIsOffline(true);
        setLoadingAuth(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoadingAuth(false);
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  if (loadingAuth) {
    return <MantraLoader />;
  }

  // If user has no active session and database is online, render Login UI
  if (!session && !isOffline) {
    return (
      <div className="min-h-screen bg-slate-50 py-20 flex flex-col items-center">
        <AuthUI redirectTo="/" />
      </div>
    );
  }

  // Render YouTubeChannelHub if user is authenticated OR operating in Offline Mode
  return (
    <div className="bg-white py-6 sm:py-12">
      <YouTubeChannelHub />
    </div>
  );
}
