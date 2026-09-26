"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell, X, Info, CheckCircle, ExternalLink, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Global Notification Manager
 * Handles:
 * 1. Auto-syncing push tokens (Default-On logic)
 * 2. Supabase Realtime fallback (Instant in-app alerts)
 * 3. Proactive permission prompting
 *
 * Log Ingestion Optimizations:
 * - Accepts profile prop to avoid redundant DB queries inside realtime callback
 * - Uses visibility-aware channel lifecycle to prevent WebSocket reconnect storms on Android
 * - Debounces reconnects so rapid tab switches don't hammer Supabase
 */
export default function NotificationManager({ session, profile }: { session: any; profile?: any }) {
  const router = useRouter();
  const { pushEnabled, isSyncing, permission, subscribe, checkStatus } = usePushNotifications(session);
  const [activeToast, setActiveToast] = useState<{ title: string; body: string; url?: string } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive roles from the already-loaded profile prop (no extra DB query needed)
  const userRoles: number[] = Array.isArray(profile?.roles)
    ? profile.roles
    : [profile?.role].filter((r): r is number => r != null);
  const isAdmin = userRoles.includes(1) || userRoles.includes(5);
  const userId = session?.user?.id;

  function subscribeChannel() {
    if (channelRef.current) return; // already subscribed
    if (!session) return;

    const channel = supabase.channel('broadcast_notifications')
      .on('broadcast', { event: 'new_alert' }, (payload) => {
        const { title, body, url, target_type, recipient_ids } = payload.payload;

        // Privacy filter using already-available data — zero extra DB queries
        const canSee = isAdmin || target_type === 'all' || recipient_ids?.includes(userId);

        if (canSee) {
          setActiveToast({ title, body, url });
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body, icon: "/favicon.ico" });
          }
        }
      })
      .subscribe();

    channelRef.current = channel;
  }

  function unsubscribeChannel() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }

  // 1. REALTIME LISTENER — visibility-aware to prevent Android reconnect storms
  useEffect(() => {
    if (!session) return;

    subscribeChannel();

    const handleVisibilityChange = () => {
      // Clear any pending reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (document.visibilityState === 'hidden') {
        // Page hidden (app switched, phone locked) — disconnect after 30s to save logs
        reconnectTimerRef.current = setTimeout(() => {
          unsubscribeChannel();
        }, 30000);
      } else {
        // Page visible again — reconnect with a short debounce to avoid rapid reconnects
        reconnectTimerRef.current = setTimeout(() => {
          subscribeChannel();
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      unsubscribeChannel();
    };
  }, [session, userId, isAdmin]);

  // 1.5. NATIVE DEEP-LINK LISTENER (Fixes file:/// error)
  useEffect(() => {
    const handleDeepLink = (event: any) => {
      const url = event.detail?.url;
      if (url) {
        console.log("[NotificationManager] Deep-link signal received:", url);
        router.push(url);
      }
    };

    window.addEventListener('app-deep-link', handleDeepLink);

    // 1.6. STARTUP PERSISTENCE CHECK (Fixes Cold-Start Race Condition)
    const checkPendingLink = () => {
      try {
        const pending = localStorage.getItem('pending_deep_link');
        if (pending) {
          console.log("[NotificationManager] Found pending startup link:", pending);
          localStorage.removeItem('pending_deep_link');
          setTimeout(() => router.push(pending), 500); // Small delay to ensure router is warm
        }
      } catch (err) {
        console.error("[NotificationManager] Storage check error:", err);
      }
    };

    checkPendingLink();

    return () => window.removeEventListener('app-deep-link', handleDeepLink);
  }, [router]);

  // 2. AUTO-DISMISS TOAST
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => setActiveToast(null), 5500); // Slightly more than progress bar
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
      {/* 1. Global In-App Toast (Realtime Fallback) */}
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
