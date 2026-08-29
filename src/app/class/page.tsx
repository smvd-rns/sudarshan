"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import LectureGrid from "@/components/LectureGrid";
import AuthUI from "@/components/AuthUI";
import { useProfile } from "@/hooks/useProfile";
import { Loader2, UserPlus, AlertCircle } from "lucide-react";
import MantraLoader from "@/components/MantraLoader";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [lectures, setLectures] = useState<any[]>([]);
  const searchTimeoutRef = useRef<any>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const pageSize = 20;

  // Profile data & completion form state
  const { profile, loading: loadingProfile, refreshProfile } = useProfile(session);
  const [regName, setRegName] = useState("");
  const [regMobile, setRegMobile] = useState("");
  const [regTemple, setRegTemple] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regError, setRegError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && profile?.full_name) {
      // Initial fetch or search reset
      fetchLectures(0, true);
    }
  }, [session, profile?.full_name]);

  const handleProfileComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setRegError("");
    try {
      const response = await fetch("/api/admin/profile", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ full_name: regName, mobile: regMobile, temple: regTemple })
      });
      if (!response.ok) throw new Error("Failed to update profile");
      await refreshProfile();
    } catch (err: any) {
      setRegError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchLectures = async (pageNum: number = 0, isInitial: boolean = false, searchQuery: string = "") => {
    try {
      if (!isInitial) setIsFetchingMore(true);
      
      const start = pageNum * pageSize;
      const end = start + pageSize - 1;

      let query = supabase
        .from("lectures")
        .select("*", { count: "exact" })
        .order("date", { ascending: false })
        .range(start, end);

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,speaker_name.ilike.%${searchQuery}%`);
      }

      const { data, count, error } = await query;
      
      if (error) throw error;

      if (isInitial) {
        setLectures(data || []);
        setPage(0);
      } else {
        setLectures(prev => [...prev, ...(data || [])]);
        setPage(pageNum);
      }

      // Check if more items exist
      if (count !== null) {
        setHasMore(start + (data?.length || 0) < count);
      } else {
        setHasMore((data?.length || 0) === pageSize);
      }

    } catch (err) {
      console.error("Failed to fetch lectures:", err);
    } finally {
      setLoadingAuth(false);
      setIsFetchingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !isFetchingMore) {
      fetchLectures(page + 1, false);
    }
  };

  const handleSearch = (q: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    // Basic debounce to avoid spamming the DB
    searchTimeoutRef.current = setTimeout(() => {
      fetchLectures(0, true, q);
    }, 500);
  };

  if (loadingAuth || !session || loadingProfile) {
    return <MantraLoader />;
  }



  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="pt-12">
        <LectureGrid 
          initialLectures={lectures} 
          userRole={profile?.role}
          onUpdate={() => fetchLectures(0, true)}
          accessToken={session?.access_token}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          isFetchingMore={isFetchingMore}
          onSearch={handleSearch}
        />
      </div>
    </div>
  );
}
