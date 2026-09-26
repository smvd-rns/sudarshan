"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2, WifiOff, RefreshCw } from "lucide-react";
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
  const [retrying, setRetrying] = useState(false);

  const { profile, loading: profileLoading, error: profileError, refreshProfile } = useProfile(session);

  const withTimeout = <T,>(promise: PromiseLike<T>, ms: number = 12000): Promise<T> => {
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

    const handleOnlineEvent = () => {
      console.log("Browser back online event detected.");
      setDbOffline(false);
      checkDbHealth();
    };

    if (typeof window !== "undefined" && !navigator.onLine) {
      handleOfflineEvent();
    }

    window.addEventListener("offline", handleOfflineEvent);
    window.addEventListener("online", handleOnlineEvent);
    return () => {
      window.removeEventListener("offline", handleOfflineEvent);
      window.removeEventListener("online", handleOnlineEvent);
    };
  }, []);

  async function checkDbHealth() {
    const CACHE_KEY = "db_health_status";
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    try {
      if (typeof window !== "undefined" && navigator.onLine) {
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

      // If we already have an active profile or session loaded, DB is verified online - skip query
      if (profile || session) {
        if (typeof window !== "undefined") {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ status: "online", timestamp: Date.now() }));
        }
        setDbOffline(false);
        setCheckingDb(false);
        return;
      }

      // Perform a direct query using client-side Supabase client with 12-second timeout
      const res: any = await withTimeout<any>(
        supabase.from("profiles").select("id").limit(1).maybeSingle(),
        12000
      );

      // If query returned an error, verify if it's a true network failure vs RLS/query logic
      if (res?.error) {
        const errMsg = (res.error.message || JSON.stringify(res.error)).toLowerCase();
        const isNetworkError = 
          errMsg.includes("failed to fetch") || 
          errMsg.includes("networkerror") || 
          errMsg.includes("timeout") || 
          errMsg.includes("typeerror");

        if (isNetworkError) {
          throw res.error;
        }
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ status: "online", timestamp: Date.now() }));
      }
      setDbOffline(false);
    } catch (err: any) {
      console.warn("[DB Health Check] Direct database check failed or timed out:", err);
      if (typeof window !== "undefined" && !navigator.onLine) {
        localStorage.removeItem(CACHE_KEY);
        setDbOffline(true);
      } else {
        const msg = (err?.message || "").toLowerCase();
        if (msg.includes("timeout") || msg.includes("failed to fetch") || msg.includes("networkerror")) {
          localStorage.removeItem(CACHE_KEY);
          setDbOffline(true);
        } else {
          setDbOffline(false);
        }
      }
    } finally {
      setCheckingDb(false);
    }
  }

  useEffect(() => {
    checkDbHealth();
  }, []);

  // Reactive sync: when profile or session is available, confirm DB is online without querying again
  useEffect(() => {
    if (profile || session) {
      setDbOffline(false);
      setCheckingDb(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("db_health_status", JSON.stringify({ status: "online", timestamp: Date.now() }));
      }
    }
  }, [profile, session]);

  // Reactive fail-safe: if profile query fails ONLY due to genuine network error, trigger offline mode
  useEffect(() => {
    if (profileError) {
      const errStr = profileError.toLowerCase();
      const isNetworkFail = errStr.includes("failed to fetch") || errStr.includes("networkerror") || errStr.includes("timeout");
      
      if (!navigator.onLine || isNetworkFail) {
        console.warn("Profile fetch failed due to network issue:", profileError);
        if (typeof window !== "undefined") {
          localStorage.removeItem("db_health_status");
        }
        setDbOffline(true);
      }
    }
  }, [profileError]);

  useEffect(() => {
    // Initial Session Check with generous 12-second timeout
    withTimeout(supabase.auth.getSession(), 12000)
      .then(({ data: { session } }: any) => {
        setSession(session);
        setAuthLoading(false);
        if (session) recordUserVisit(session.user.id);
      })
      .catch(err => {
        console.warn("Auth check failed or timed out:", err);
        if (typeof window !== "undefined" && !navigator.onLine) {
          localStorage.removeItem("db_health_status");
          setDbOffline(true);
        }
        setAuthLoading(false);
      });

    // Auth State Sync
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
    if (dbOffline) return;
    
    try {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const storageKey = `recorded_visit_${userId}_${today}`;
      
      if (localStorage.getItem(storageKey)) {
        return;
      }

      localStorage.setItem(storageKey, "true");

      setTimeout(async () => {
        try {
          await supabase
            .from("profiles")
            .update({ last_visit_at: new Date().toISOString() })
            .eq("id", userId);
            
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
          localStorage.removeItem(storageKey);
        }
      }, 3500);

    } catch (err) {
      console.error("Visit log setup failed:", err);
    }
  }

  function handleRedirect(currentSession: any) {
    if (checkingDb) return;

    const isPublicRoute = pathname === "/" || pathname === "/login" || pathname === "/auth/callback" || pathname === "/prasadam-count" || pathname === "/register/bcdb" || pathname.startsWith("/store/quick-request");
    
    if (dbOffline) {
      if (pathname !== "/") {
        router.push("/");
      }
      return;
    }

    if (!currentSession) {
      if (!isPublicRoute || pathname === "/") {
        router.push("/login");
      }
    }
  }

  const handleRetryConnection = async () => {
    setRetrying(true);
    if (typeof window !== "undefined") {
      localStorage.removeItem("db_health_status");
    }
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        setSession(data.session);
      }
      const res: any = await withTimeout<any>(
        supabase.from("profiles").select("id").limit(1).maybeSingle(),
        10000
      );
      if (!res?.error || (!res.error.message?.toLowerCase().includes("failed to fetch") && !res.error.message?.toLowerCase().includes("timeout"))) {
        setDbOffline(false);
        setOfflineAcknowledged(true);
      }
    } catch (_) {
      setDbOffline(true);
    } finally {
      setRetrying(false);
      setCheckingDb(false);
    }
  };

  const isPublicRoute = pathname === "/" || pathname === "/login" || pathname === "/auth/callback" || pathname === "/prasadam-count" || pathname === "/register/bcdb" || pathname.startsWith("/store/quick-request");

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
          <p className="text-slate-500 mb-8 leading-relaxed font-medium text-xs sm:text-sm">
            We are having trouble connecting to the live database. You can retry connecting or access the Spiritual Library in Offline Mode to watch cached lectures.
          </p>
          <div className="space-y-3">
            <button 
              onClick={handleRetryConnection}
              disabled={retrying}
              className="w-full py-4 px-6 bg-devo-600 hover:bg-devo-700 text-white rounded-2xl font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2 text-xs sm:text-sm active:scale-[0.98]"
            >
              {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              RETRY CONNECTION
            </button>
            <button 
              onClick={() => setOfflineAcknowledged(true)}
              className="w-full py-3.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold tracking-wide transition-all text-xs"
            >
              ENTER OFFLINE MODE
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <NotificationManager session={session} profile={profile} />
      {children}
    </>
  );
}
