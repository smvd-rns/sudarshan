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

export function useStoreAuth() {
  const [storeUser, setStoreUser] = useState<StoreUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
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
            setStoreUser(data.storeUser);
          } else {
            setError("You do not have access to the store module.");
          }
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError("Network error");
          setLoading(false);
        }
      }
    };
    checkAuth();
    return () => { mounted = false; };
  }, []);

  return { storeUser, loading, error };
}

export default function StoreGuard({ children }: { children: React.ReactNode }) {
  const { storeUser, loading, error } = useStoreAuth();
  const router = useRouter();

  if (typeof window !== "undefined" && window.location.pathname.startsWith("/store/quick-request")) {
    return <>{children}</>;
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-10 h-10 animate-spin text-devo-500" /></div>;
  }

  if (error || !storeUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full">
          <h1 className="text-2xl font-black text-red-600 mb-2">Access Denied</h1>
          <p className="text-slate-600 font-medium mb-6">
            {error || "You do not have permission to view the store module."}
          </p>
          <a href="/" className="inline-block px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
