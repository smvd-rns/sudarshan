"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export interface StoreUser {
  id: string;
  email: string;
  full_name: string;
  mobile?: string;
  temple?: string;
  kurta_size?: string;
  chappal_size?: string;
  color_preference?: string;
  sarvadhan_access_requested?: boolean;
  store_access_level: 'none' | 'general' | 'internal';
  has_special_access: boolean;
  is_store_admin: boolean;
  is_super_or_store_admin?: boolean;
  is_store_manager?: boolean;
  can_access_approvals?: boolean;
  can_access_admin_panel?: boolean;
}

const STORE_USER_CACHE_KEY = "samvardhan_store_user_v2";
let memoryStoreUser: StoreUser | null = null;

function getCachedStoreUser(): StoreUser | null {
  if (memoryStoreUser) return memoryStoreUser;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORE_USER_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) {
        memoryStoreUser = parsed;
        return parsed;
      }
    }
  } catch {}
  return null;
}

export function useStoreAuth() {
  const [storeUser, setStoreUser] = useState<StoreUser | null>(() => getCachedStoreUser());
  const [loading, setLoading] = useState<boolean>(() => !getCachedStoreUser());
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    // Fast sync from cache
    const cached = getCachedStoreUser();
    if (cached) {
      setStoreUser(cached);
      setLoading(false);
    }

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (mounted) setLoading(false);
          return;
        }

        const res = await fetch('/api/store/auth', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        
        if (!res.ok) {
          if (mounted) {
            setError("Access check failed.");
            setLoading(false);
          }
          return;
        }

        const data = await res.json();
        if (mounted) {
          if (data.access && data.storeUser) {
            memoryStoreUser = data.storeUser;
            try {
              localStorage.setItem(STORE_USER_CACHE_KEY, JSON.stringify(data.storeUser));
            } catch {}
            setStoreUser(data.storeUser);
            setError(null);
          } else {
            setError("You do not have access to the store module.");
            try {
              localStorage.removeItem(STORE_USER_CACHE_KEY);
            } catch {}
            memoryStoreUser = null;
          }
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          if (!cached) {
            setError("Network error");
          }
          setLoading(false);
        }
      }
    };
    checkAuth();
    return () => { mounted = false; };
  }, []);

  return { storeUser, loading, error };
}

export default function StoreGuard({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string }) {
  const { storeUser, loading, error } = useStoreAuth();
  const router = useRouter();

  if (typeof window !== "undefined" && window.location.pathname.startsWith("/store/quick-request")) {
    return <>{children}</>;
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-10 h-10 animate-spin text-devo-500" /></div>;
  }

  const isAdminRequired = requiredRole === 'admin';
  const hasAdminAccess = storeUser?.can_access_admin_panel || storeUser?.is_store_admin || storeUser?.is_super_or_store_admin;

  if (error || !storeUser || (isAdminRequired && !hasAdminAccess)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full">
          <h1 className="text-2xl font-black text-red-600 mb-2">Access Denied</h1>
          <p className="text-slate-600 font-medium mb-6">
            {isAdminRequired && !hasAdminAccess
              ? "You need Store Admin privileges to access this page."
              : (error || "You do not have permission to view the store module.")}
          </p>
          <a href="/store" className="inline-block px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors">
            Return to Store
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
