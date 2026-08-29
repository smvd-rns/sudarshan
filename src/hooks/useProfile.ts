"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const BCDB_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const bcdbCheckCache = new Map<string, { isBcdb: boolean; at: number }>();

export function useProfile(session: any) {
  const [profile, setProfile] = useState<any>(null);
  const [isBcdb, setIsBcdb] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTimeout, setIsTimeout] = useState(false);
  const [lastCheckedId, setLastCheckedId] = useState<string | null>(null);

  const fetchProfile = useCallback(async (userId: string, force = false) => {
    if (userId === lastCheckedId && !force) {
       setLoading(false);
       return;
    }

    setLoading(true);
    setLastCheckedId(userId);
    try {
      const checkBcdb = async (email: string, roleOrRoles?: number | number[]) => {
        if (!email) return;

        const rolesArr = Array.isArray(roleOrRoles) 
          ? roleOrRoles 
          : (roleOrRoles !== undefined ? [roleOrRoles] : []);

        const hasAdminRole = rolesArr.includes(1) || rolesArr.includes(5);

        if (hasAdminRole) {
          setIsBcdb(true);
          return;
        }

        // Database persistence check
        if (profile?.is_bcdb_verified) {
          setIsBcdb(true);
          return;
        }

        const normalizedEmail = email.toLowerCase().trim();
        const cached = bcdbCheckCache.get(normalizedEmail);
        const now = Date.now();
        if (cached && now - cached.at < BCDB_CACHE_TTL_MS) {
          setIsBcdb(cached.isBcdb);
          return;
        }

        try {
          setIsTimeout(false);
          const headers: Record<string, string> = {};
          if (session) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }
          const res = await fetch(`/api/auth/bcdb-check`, {
             headers,
             signal: AbortSignal.timeout(10000) // Hard browser timeout
          });
          
          if (res.status === 504) {
             console.warn("BCDB Check Timed Out");
             setIsTimeout(true);
             setIsBcdb(false);
             return;
          }

          const data = await res.json();
          const result = !!data.isBcdb;
          setIsBcdb(result);
          bcdbCheckCache.set(normalizedEmail, { isBcdb: result, at: now });
        } catch (err) {
          console.error("BCDB Check API Error:", err);
          setIsBcdb(false);
        }
      };

      // 1. Try fetching by exact ID
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setProfile(data);
        // Initialize state immediately from database flag to prevent UI flicker
        if (data.is_bcdb_verified) {
          setIsBcdb(true);
        }
        await checkBcdb(data.email || session?.user?.email, data.roles || data.role);
        setLoading(false);
        return;
      }

      // 2. No profile by ID. Check if an unlinked profile exists with this email (Pre-filled from BCDB)
      if (session?.user?.email) {
        const { data: emailMatch, error: emailError } = await supabase
          .from("profiles")
          .select("*")
          .eq("email", session.user.email)
          .maybeSingle();

        if (emailError) throw emailError;

        if (emailMatch) {
          // CLAIM THE PROFILE: Update the existing profile with the new auth ID
          const { data: updatedProfile, error: claimError } = await supabase
            .from("profiles")
            .update({ id: userId, updated_at: new Date().toISOString() })
            .eq("email", session.user.email)
            .select()
            .single();

          if (claimError) throw claimError;
          
          setProfile(updatedProfile);
          await checkBcdb(updatedProfile.email || session?.user?.email, updatedProfile.roles || updatedProfile.role);
          setLoading(false);
          return;
        }
      }

      // 3. Fallback: Create a new blank profile if none exists by ID or Email
      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .upsert({ 
          id: userId, 
          email: session?.user?.email, 
          roles: [6],
          full_name: session?.user?.user_metadata?.full_name || "",
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single();
        
      if (createError) throw createError;
      setProfile(newProfile);
      await checkBcdb(newProfile.email || session?.user?.email, newProfile.roles || newProfile.role);

    } catch (err: any) {
      console.error("Profile Hook Error:", err.message || err);
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, lastCheckedId]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile(session.user.id);
    } else {
      setProfile(null);
      setIsBcdb(false);
      setLastCheckedId(null);
      setLoading(false);
    }
  }, [session?.user?.id, fetchProfile]);

  const activeProfile = (profile && profile.id === session?.user?.id) ? profile : null;
  const activeIsBcdb = (profile && profile.id === session?.user?.id) ? isBcdb : false;
  const derivedLoading = loading || (!!session?.user?.id && lastCheckedId !== session.user.id);

  const uRoles = Array.isArray(activeProfile?.roles) 
    ? activeProfile.roles 
    : [activeProfile?.role].filter(r => r != null);
  
  return { 
    profile: activeProfile, 
    isBcdb: activeIsBcdb, 
    isSuperAdmin: uRoles.includes(1),
    isManager: uRoles.includes(1) || uRoles.includes(5),
    isAttendanceIncharge: uRoles.includes(1) || uRoles.includes(3),
    isVideoUploader: uRoles.includes(1) || uRoles.includes(2),
    isVmIncharge: uRoles.includes(1) || uRoles.includes(7),
    loading: derivedLoading, 
    error, 
    isTimeout,
    refreshProfile: () => session?.user?.id && fetchProfile(session.user.id, true) 
  };
}
