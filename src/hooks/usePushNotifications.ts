import { useState, useEffect, useCallback } from 'react';

// Global queue to catch FCM tokens before the hook is mounted
let queuedFcmToken: string | null = null;
if (typeof window !== 'undefined') {
  (window as any).registerFcmToken = (token: string) => {
    console.log("[PushDiag] Global catch: FCM Token queued.", token);
    queuedFcmToken = token;
    // If a listener is already attached, call it
    if ((window as any).onFcmTokenReady) {
      (window as any).onFcmTokenReady(token);
    }
  };
}

/**
 * Hook for managing push notifications across the app.
 * Handles auto-syncing local registration with the server.
 */
export function usePushNotifications(session: any) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const syncSubscription = useCallback(async (subscription: any, provider = 'web-push') => {
    if (!session?.access_token) return;
    
    // Prevent syncing on every single page load across tabs
    const syncKey = `push_sync_${session.user.id}_${provider}`;
    const lastSync = localStorage.getItem(syncKey);
    const now = Date.now();
    // Only sync once every 24 hours
    if (lastSync && (now - parseInt(lastSync, 10) < 86400000)) {
      setPushEnabled(true);
      return;
    }

    setIsSyncing(true);
    try {
      console.log(`[PushDiag] Proactively syncing ${provider} registration to server...`);
      let synced = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        const res = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            subscription,
            provider,
            device_type: window.innerWidth < 768 ? 'mobile' : 'desktop'
          })
        });

        if (res.ok) {
          setPushEnabled(true);
          localStorage.setItem(syncKey, now.toString());
          console.log(`[PushDiag] Auto-sync success (${provider}).`);
          synced = true;
          break;
        }

        // If it's a timeout/busy error, wait longer and retry
        if ((res.status === 503 || res.status === 504) && attempt < 5) {
          console.warn(`[PushDiag] Database busy (Attempt ${attempt}/5). Retrying in ${2 * attempt}s...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          continue;
        }

        const payload = await res.json().catch(() => ({}));
        console.error(`[PushDiag] Sync failed (${res.status}):`, payload?.error || "Unknown error");
        break;
      }

      if (!synced) {
        setPushEnabled(false);
      }
    } catch (err) {
      console.error("[PushDiag] Sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [session?.access_token, session?.user?.id]);

  const checkStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;
    
    const isNative = (window as any).isNativeApp === true;
    setPermission(Notification.permission);
    
    if (isNative) {
      console.log("[PushDiag] Native environment. Checking for queued token...");
      if (queuedFcmToken) {
        await syncSubscription({ token: queuedFcmToken }, 'fcm');
      }
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      setPushEnabled(!!subscription);

      if (subscription) {
        await syncSubscription(subscription);
      } else if (Notification.permission === 'granted') {
        // COMPULSORY: If permission is granted but no subscription exists, create it silently!
        console.log("[PushDiag] Permission granted but no record. SILENT SYNC STARTING...");
        await subscribe(); // This handles SW and PushManager registration
      }
    } catch (err) {
      console.error("[PushDiag] Status check error:", err);
    }
  }, [syncSubscription]);

  const subscribe = async () => {
    if (typeof window === 'undefined') return;
    setIsSubscribing(true);
    
    try {
      console.log("[PushDiag] SILENT REGISTRATION IN PROGRESS...");
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicVapidKey) throw new Error("VAPID missing");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      await syncSubscription(subscription);
      setPermission(Notification.permission);
      return true;
    } catch (err) {
      console.error("[PushDiag] Silent registration failed:", err);
      throw err;
    } finally {
      setIsSubscribing(false);
    }
  };

  // Bridge for Native Android Tokens
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    (window as any).onFcmTokenReady = (token: string) => {
      console.log("[PushDiag] FCM Token received via bridge callback.");
      syncSubscription({ token }, 'fcm');
    };

    // If a token was already queued before this effect ran, process it now
    if (queuedFcmToken) {
      console.log("[PushDiag] Processing previously queued FCM token.");
      syncSubscription({ token: queuedFcmToken }, 'fcm');
      queuedFcmToken = null; // Mark as processed
    }
  }, [syncSubscription]);

  // Initial check on mount/session change
  useEffect(() => {
    if (session) {
      checkStatus();
    }
  }, [session, checkStatus]);

  return { pushEnabled, isSubscribing, isSyncing, permission, subscribe, checkStatus };
}
