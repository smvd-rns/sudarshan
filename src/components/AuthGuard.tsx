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

  const { profile, loading: profileLoading, error: profileError, refreshProfile } = useProfile(session);

  const withTimeout = <T,>(promise: PromiseLike<T>, ms: number = 3000): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      Promise.resolve(promise).then(
        (res) => { clearTimeout(timer); resolve(res); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });
  };

  useEffect(() => {
    const handleOfflineEvent = () => {
      console.warn("Browser offline event detected.");
      if (typeof window !== "undefined") {
        localStorage.removeItem("db_health_status");
      }
      setDbOffline(true);
      setCheckingDb(false);
      setAuthLoading(false);
    };

    if (typeof window !== "undefined" && !navigator.onLine) {
      handleOfflineEvent();
    }

    window.addEventListener("offline", handleOfflineEvent);
    return () => window.removeEventListener("offline", handleOfflineEvent);
  }, []);

  useEffect(() => {
    // Direct check to database (bypassing Vercel Serverless API) with a 10-minute client cache
    async function checkDbHealth() {
      const CACHE_KEY = "db_health_status";
      const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

      try {
        if (typeof window !== "undefined") {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const { status, timestamp } = JSON.parse(cached);
            if (status === "online" && Date.now() - timestamp < CACHE_TTL) {
              setDbOffline(false);
              setCheckingDb(false);
              return;
            }
          }
        }

        // Perform a direct query using client-side Supabase client with 3-second timeout
        const res: any = await withTimeout<any>(
          supabase.from("profiles").select("id").limit(1).maybeSingle(),
          3000
        );
        if (res?.error) throw res.error;

        if (typeof window !== "undefined") {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ status: "online", timestamp: Date.now() }));
        }
        setDbOffline(false);
      } catch (err) {
        console.warn("[DB Health Check] Direct database check failed or timed out:", err);
        if (typeof window !== "undefined") {
          localStorage.removeItem(CACHE_KEY);
        }
        setDbOffline(true);
      } finally {
        setCheckingDb(false);
      }
    }
    checkDbHealth();
  }, []);

  // Reactive fail-safe: if profile query fails, invalidate cache and trigger offline mode
  useEffect(() => {
    if (profileError) {
      console.warn("Profile fetch failed, database might be offline:", profileError);
      if (typeof window !== "undefined") {
        localStorage.removeItem("db_health_status");
      }
      setDbOffline(true);
    }
  }, [profileError]);

  useEffect(() => {
    // 1. Initial Session Check with fallback for network error / timeout
    withTimeout(supabase.auth.getSession(), 3000)
      .then(({ data: { session } }: any) => {
        setSession(session);
        setAuthLoading(false);
        if (session) recordUserVisit(session.user.id);
      })
      .catch(err => {
        console.warn("Auth check failed or timed out (DB offline):", err);
        if (typeof window !== "undefined") {
          localStorage.removeItem("db_health_status");
        }
        setDbOffline(true);
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

  function recordUserVisit(userId: string) {
    if (typeof window === "undefined") return;
    if (dbOffline) return; // Skip logs if DB is offline
    
    try {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const storageKey = `recorded_visit_${userId}_${today}`;
      
      // Prevent redundant database writes on every page navigation across all tabs/reloads
      if (localStorage.getItem(storageKey)) {
        return;
      }

      // Save immediately to prevent race conditions during rapid reloads
      localStorage.setItem(storageKey, "true");

      // Defer the heavy DB writes by 3.5 seconds to let videos and UI load fast
      setTimeout(async () => {
        try {
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
        } catch (err) {
          console.error("Visit log failed during background sync:", err);
          // If it fails, remove the key so it tries again next time
          localStorage.removeItem(storageKey);
        }
      }, 3500);

    } catch (err) {
      console.error("Visit log setup failed:", err);
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
