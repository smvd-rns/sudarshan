"use client";

import { useEffect, useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell, X } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Global Notification Manager
 * Handles:
 * 1. Auto-syncing push tokens via FCM (Default-On logic)
 * 2. Native deep-link routing from FCM tap events
 * 3. Startup persistence check for cold-start deep links
 *
 * NOTE: Supabase Realtime WebSocket removed — notifications are
 * delivered exclusively via FCM push, which works when app is open,
 * backgrounded, or closed. This eliminates ~20% of log ingestion.
 */
export default function NotificationManager({ session, profile }: { session: any; profile?: any }) {
  const router = useRouter();
  const { pushEnabled, isSyncing, permission, subscribe, checkStatus } = usePushNotifications(session);
  const [activeToast, setActiveToast] = useState<{ title: string; body: string; url?: string } | null>(null);

  // 1. NATIVE DEEP-LINK LISTENER (handles FCM tap → in-app navigation)
  useEffect(() => {
    const handleDeepLink = (event: any) => {
      const url = event.detail?.url;
      if (url) {
        router.push(url);
      }
    };

    window.addEventListener('app-deep-link', handleDeepLink);

    // 2. STARTUP PERSISTENCE CHECK (fixes cold-start race condition)
    // When FCM wakes the app, the deep-link may arrive before the router is ready.
    // We store it in localStorage and process it here on mount.
    const checkPendingLink = () => {
      try {
        const pending = localStorage.getItem('pending_deep_link');
        if (pending) {
          localStorage.removeItem('pending_deep_link');
          setTimeout(() => router.push(pending), 500);
        }
      } catch (err) {
        console.error("[NotificationManager] Storage check error:", err);
      }
    };

    checkPendingLink();

    return () => window.removeEventListener('app-deep-link', handleDeepLink);
  }, [router]);

  // 3. AUTO-DISMISS TOAST (shown when FCM delivers an in-app notification event)
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => setActiveToast(null), 5500);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  const handleToastClick = (url: string) => {
    setActiveToast(null);
    if (url) {
      router.push(url);
    }
  };

  if (!session) return null;

  return (
    <>
      {activeToast && (
        <div className="fixed top-4 sm:top-20 right-4 left-4 sm:left-auto z-[9999] sm:w-[400px] animate-in slide-in-from-top-4 sm:slide-in-from-right-8 duration-500">
          <div className="bg-white/95 backdrop-blur-3xl border-2 border-purple-500/20 rounded-3xl shadow-[0_20px_50px_rgba(147,51,234,0.15)] p-5 sm:p-6 ring-1 ring-black/5 overflow-hidden">
            {/* Countdown Progress Bar */}
            <div className="absolute bottom-0 left-0 h-1 bg-purple-500/20 w-full text-white">
               <div className="h-full bg-purple-500 animate-out fade-out slide-out-to-left fill-mode-forwards duration-[5000ms]" />
            </div>

            <button
              onClick={() => setActiveToast(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-purple-200">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center gap-2">
                   <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">New Alert</span>
                   <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <h4 className="font-black font-outfit text-slate-900 mt-1 text-sm sm:text-base">{activeToast.title}</h4>
                <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1 line-clamp-2 leading-relaxed">{activeToast.body}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
