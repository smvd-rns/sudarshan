"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2, WifiOff } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import MantraLoader from "./MantraLoader";
import AccessDenied from "./AccessDenied";
import NotificationManager from "./NotificationManager";
import ProfileCompletion from "./ProfileCompletion";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [dbOffline, setDbOffline] = useState(false);
  const [checkingDb, setCheckingDb] = useState(true);
  const [offlineAcknowledged, setOfflineAcknowledged] = useState(false);

  const { profile, loading: profileLoading, refreshProfile } = useProfile(session);

  useEffect(() => {
    // Check if Next.js/DB API is responding
    async function checkDbHealth() {
      try {
        const res = await fetch("/api/db-health");
        if (!res.ok) {
          setDbOffline(true);
        } else {
          setDbOffline(false);
        }
      } catch (err) {
        setDbOffline(true);
      } finally {
        setCheckingDb(false);
      }
    }
    checkDbHealth();
    const interval = setInterval(checkDbHealth, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 1. Initial Session Check with fallback for network error
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setAuthLoading(false);
        if (session) recordUserVisit(session.user.id);
      })
      .catch(err => {
        console.warn("Auth check failed (DB offline):", err);
        setAuthLoading(false);
      });

    // 2. Auth State Sync
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
      if (session) recordUserVisit(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Trigger redirection once initial DB health & Auth status are determined
  useEffect(() => {
    if (!checkingDb && !authLoading) {
      handleRedirect(session);
    }
  }, [checkingDb, authLoading, session, pathname, dbOffline]);

  async function recordUserVisit(userId: string) {
    if (typeof window === "undefined") return;
    if (dbOffline) return; // Skip logs if DB is offline
    
    try {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const storageKey = `recorded_visit_${userId}_${today}`;
      
      // Prevent redundant database writes on every page navigation
      if (sessionStorage.getItem(storageKey)) {
        return;
      }

      // 1. Update Profile (Last Seen status)
      await supabase
        .from("profiles")
        .update({ last_visit_at: new Date().toISOString() })
        .eq("id", userId);
        
      // 2. Insert into Historical Daily Logs (Unique per User per Day)
      // Ensure "migration_user_visits.sql" has been run first!
      await supabase
        .from("user_visits")
        .upsert(
          { 
            user_id: userId, 
            visit_date: today 
          }, 
          { onConflict: 'user_id,visit_date' }
        );

      // Save to sessionStorage to skip on future page changes during this tab session
      sessionStorage.setItem(storageKey, "true");
    } catch (err) {
      console.error("Visit log failed:", err);
    }
  }

  function handleRedirect(currentSession: any) {
    if (checkingDb) return; // Block redirect until health check is done

    const isPublicRoute = pathname === "/" || pathname === "/login" || pathname === "/auth/callback" || pathname === "/prasadam-count" || pathname === "/register/bcdb";
    
    if (dbOffline) {
      // If DB is offline, block other pages and enforce Home page (/)
      if (pathname !== "/") {
        router.push("/");
      }
      return;
    }

    // If DB is online, take Guest (no session) from Home (/) to Login page
    if (!currentSession) {
      if (!isPublicRoute || pathname === "/") {
        router.push("/login");
      }
    }
  }

  const isPublicRoute = pathname === "/" || pathname === "/login" || pathname === "/auth/callback" || pathname === "/prasadam-count" || pathname === "/register/bcdb";

  // 1. Loading States (Centralized)
  const isChecking = checkingDb || authLoading || (session && profileLoading && !dbOffline);
  
  if (isChecking && !isPublicRoute) {
    return <MantraLoader />;
  }

  // 2. RBAC Logic (Authorized User Check)
  if (session && profile && pathname.startsWith("/admin")) {
    const roles = Array.isArray(profile.roles) ? profile.roles : [profile.role];
    const isAuthorized = roles.includes(1) || roles.includes(5);
    
    if (!isAuthorized) {
      return <AccessDenied />;
    }
  }

  // 3. Profile Completion Requirement
  const isProfileComplete = profile?.full_name && profile?.mobile && profile?.temple;
  if (session && profile && !isProfileComplete && !isPublicRoute) {
    return <ProfileCompletion session={session} refreshProfile={refreshProfile} />;
  }

  // 4. Offline Mode Prompt
  if (dbOffline && !offlineAcknowledged) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 sm:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 max-w-md w-full text-center">
          <div className="mx-auto w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6 border border-amber-100/50">
            <WifiOff className="w-10 h-10 text-amber-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mb-3 tracking-tight">Connection Unstable</h2>
          <p className="text-slate-500 mb-8 leading-relaxed font-medium">
            We are having trouble connecting to the live database. You can still access the Spiritual Library in Offline Mode to watch cached lectures.
          </p>
          <button 
            onClick={() => setOfflineAcknowledged(true)}
            className="w-full py-4 px-6 bg-amber-500 text-white rounded-2xl font-bold tracking-wide hover:bg-amber-600 transition-all shadow-sm hover:shadow active:scale-[0.98]"
          >
            ENTER OFFLINE MODE
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <NotificationManager session={session} />
      {children}
    </>
  );
}
