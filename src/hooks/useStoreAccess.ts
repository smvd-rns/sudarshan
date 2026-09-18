"use client";

import { useEffect, useState } from "react";

let globalStoreAccessCache: { userId: string; hasAccess: boolean; isAdmin: boolean } | null = null;

export function useStoreAccess(session: any) {
  const currentUserId = session?.user?.id;
  const isMemoryCached = globalStoreAccessCache && globalStoreAccessCache.userId === currentUserId;

  const [hasStoreAccess, setHasStoreAccess] = useState<boolean>(() => {
    if (isMemoryCached) return globalStoreAccessCache!.hasAccess;
    if (!currentUserId || typeof window === "undefined") return false;
    try {
      const cached = localStorage.getItem(`store_access_${currentUserId}`);
      return cached !== null ? JSON.parse(cached) : false;
    } catch {
      return false;
    }
  });

  const [isStoreAdmin, setIsStoreAdmin] = useState<boolean>(() => {
    if (isMemoryCached) return globalStoreAccessCache!.isAdmin;
    if (!currentUserId || typeof window === "undefined") return false;
    try {
      const cached = localStorage.getItem(`store_admin_${currentUserId}`);
      return cached !== null ? JSON.parse(cached) : false;
    } catch {
      return false;
    }
  });
  
  useEffect(() => {
    let mounted = true;
    const checkAccess = async () => {
      if (!session || !currentUserId) {
        if (mounted) {
          setHasStoreAccess(false);
          setIsStoreAdmin(false);
        }
        return;
      }

      try {
        const res = await fetch('/api/store/auth', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          const hasAccess = !!data.access;
          const isAdmin = !!data.storeUser?.is_store_admin;
          
          globalStoreAccessCache = { userId: currentUserId, hasAccess, isAdmin };
          try {
            localStorage.setItem(`store_access_${currentUserId}`, JSON.stringify(hasAccess));
            localStorage.setItem(`store_admin_${currentUserId}`, JSON.stringify(isAdmin));
          } catch {
            // ignore localStorage errors
          }

          if (mounted) {
            setHasStoreAccess(hasAccess);
            setIsStoreAdmin(isAdmin);
          }
        }
      } catch (err) {
        // silently fail
      }
    };

    checkAccess();
    return () => { mounted = false; };
  }, [session, currentUserId]);

  return { hasStoreAccess, isStoreAdmin };
}

