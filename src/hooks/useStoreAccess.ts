"use client";

import { useEffect, useState } from "react";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days cache

interface StoreAccessCacheObj {
  userId?: string;
  hasAccess: boolean;
  isAdmin: boolean;
  updatedAt: number;
}

let globalStoreAccessCache: StoreAccessCacheObj | null = null;

function readCachedAccess(currentUserId?: string): { hasAccess: boolean; isAdmin: boolean } | null {
  if (typeof window === "undefined") return null;

  try {
    // 1. Try user-specific cache if currentUserId is available
    if (currentUserId) {
      const userCached = localStorage.getItem(`store_access_${currentUserId}`);
      if (userCached) {
        const parsed = JSON.parse(userCached);
        if (typeof parsed === "boolean") {
          return { hasAccess: parsed, isAdmin: false };
        }
        if (parsed && typeof parsed === "object" && typeof parsed.hasAccess === "boolean") {
          const isFresh = !parsed.updatedAt || (Date.now() - parsed.updatedAt < CACHE_TTL_MS);
          if (isFresh) {
            return { hasAccess: parsed.hasAccess, isAdmin: !!parsed.isAdmin };
          }
        }
      }
    }

    // 2. Fallback to last known device cache (for immediate frame 0 render before session restores)
    const lastKnown = localStorage.getItem("store_access_last_known");
    if (lastKnown) {
      const parsed = JSON.parse(lastKnown);
      if (typeof parsed === "boolean") {
        return { hasAccess: parsed, isAdmin: false };
      }
      if (parsed && typeof parsed === "object" && typeof parsed.hasAccess === "boolean") {
        const isFresh = !parsed.updatedAt || (Date.now() - parsed.updatedAt < CACHE_TTL_MS);
        if (isFresh) {
          return { hasAccess: parsed.hasAccess, isAdmin: !!parsed.isAdmin };
        }
      }
    }
  } catch (e) {
    // Ignore parse errors
  }

  return null;
}

export function useStoreAccess(session: any) {
  const currentUserId = session?.user?.id;
  const isMemoryCached = globalStoreAccessCache && (currentUserId ? globalStoreAccessCache.userId === currentUserId : true);

  const [hasStoreAccess, setHasStoreAccess] = useState<boolean>(() => {
    if (isMemoryCached && globalStoreAccessCache) {
      return globalStoreAccessCache.hasAccess;
    }
    const cached = readCachedAccess(currentUserId);
    return cached ? cached.hasAccess : false;
  });

  const [isStoreAdmin, setIsStoreAdmin] = useState<boolean>(() => {
    if (isMemoryCached && globalStoreAccessCache) {
      return globalStoreAccessCache.isAdmin;
    }
    const cached = readCachedAccess(currentUserId);
    return cached ? cached.isAdmin : false;
  });

  useEffect(() => {
    let mounted = true;

    if (!session || !currentUserId) {
      return;
    }

    const checkAccess = async () => {
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
          const updatedAt = Date.now();

          globalStoreAccessCache = { userId: currentUserId, hasAccess, isAdmin, updatedAt };

          try {
            const cacheObj: StoreAccessCacheObj = { userId: currentUserId, hasAccess, isAdmin, updatedAt };
            localStorage.setItem(`store_access_${currentUserId}`, JSON.stringify(cacheObj));
            localStorage.setItem("store_access_last_known", JSON.stringify(cacheObj));
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

export function clearStoreAccessCache() {
  globalStoreAccessCache = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("store_access_last_known");
    } catch {}
  }
}


