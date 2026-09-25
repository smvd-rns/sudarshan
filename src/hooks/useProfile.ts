"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const BCDB_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache for profile
const bcdbCheckCache = new Map<string, { isBcdb: boolean; at: number }>();

let globalProfileCache: { userId: string; profile: any; isBcdb: boolean; at: number } | null = null;
let pendingProfilePromises = new Map<string, Promise<{ profile: any; isBcdb: boolean }>>();

export function useProfile(session: any) {
  const currentUserId = session?.user?.id;
  const now = Date.now();
  const isCached = !!(
    globalProfileCache &&
    globalProfileCache.userId === currentUserId &&
    now - globalProfileCache.at < PROFILE_CACHE_TTL_MS
  );

  const [profile, setProfile] = useState<any>(isCached ? globalProfileCache!.profile : null);
  const [isBcdb, setIsBcdb] = useState(isCached ? globalProfileCache!.isBcdb : false);

  const [loading, setLoading] = useState(!isCached);
  const [error, setError] = useState<string | null>(null);
  const [isTimeout, setIsTimeout] = useState(false);
  const [lastCheckedId, setLastCheckedId] = useState<string | null>(isCached ? currentUserId : null);

  const fetchProfile = useCallback(async (userId: string, force = false) => {
    const checkNow = Date.now();
    const cacheValid = !!(
      globalProfileCache &&
      globalProfileCache.userId === userId &&
      checkNow - globalProfileCache.at < PROFILE_CACHE_TTL_MS
    );

    if (userId === lastCheckedId && !force && cacheValid) {
       setLoading(false);
       return;
    }

    if (!cacheValid || force) {
      setLoading(true);
    }
    setLastCheckedId(userId);

    // Request Deduplication: If a request is already in-flight for this userId and not forced, attach to it
    if (pendingProfilePromises.has(userId) && !force) {
      try {
        const result = await pendingProfilePromises.get(userId)!;
        setProfile(result.profile);
        setIsBcdb(result.isBcdb);
        setLoading(false);
        return;
      } catch (err) {
        // Fallthrough to attempt a fresh fetch if pending promise failed
      }
    }

    const fetchPromise = (async () => {
      let finalBcdb = false;

      const checkBcdb = async (email: string, roleOrRoles?: number | number[]) => {
        if (!email) return false;

        const rolesArr = Array.isArray(roleOrRoles) 
          ? roleOrRoles 
          : (roleOrRoles !== undefined ? [roleOrRoles] : []);

        const hasAdminRole = rolesArr.includes(1) || rolesArr.includes(5);

        if (hasAdminRole) {
          setIsBcdb(true);
          return true;
        }

        const normalizedEmail = email.toLowerCase().trim();
        const cached = bcdbCheckCache.get(normalizedEmail);
        const timeNow = Date.now();
        if (cached && timeNow - cached.at < BCDB_CACHE_TTL_MS) {
          setIsBcdb(cached.isBcdb);
          return cached.isBcdb;
        }

        try {
          setIsTimeout(false);
          const headers: Record<string, string> = {};
          if (session) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }
          const res = await fetch(`/api/auth/bcdb-check`, {
             headers,
             signal: AbortSignal.timeout(10000)
          });
          
          if (res.status === 504) {
             console.warn("BCDB Check Timed Out");
             setIsTimeout(true);
             setIsBcdb(false);
             return false;
          }

          const data = await res.json();
          const result = !!data.isBcdb;
          setIsBcdb(result);
          bcdbCheckCache.set(normalizedEmail, { isBcdb: result, at: timeNow });
          return result;
        } catch (err) {
          console.error("BCDB Check API Error:", err);
          setIsBcdb(false);
          return false;
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
        if (data.is_bcdb_verified) {
          setIsBcdb(true);
          finalBcdb = true;
        } else {
          finalBcdb = await checkBcdb(data.email || session?.user?.email, data.roles || data.role);
        }
        const cachedObj = { userId, profile: data, isBcdb: finalBcdb, at: Date.now() };
        globalProfileCache = cachedObj;
        return { profile: data, isBcdb: finalBcdb };
      }

      // 2. Claim existing unlinked profile if email matches
      if (session?.user?.email) {
        const { data: emailMatch, error: emailError } = await supabase
          .from("profiles")
          .select("*")
          .eq("email", session.user.email)
          .maybeSingle();

        if (emailError) throw emailError;

        if (emailMatch) {
          const { data: updatedProfile, error: claimError } = await supabase
            .from("profiles")
            .update({ id: userId, updated_at: new Date().toISOString() })
            .eq("email", session.user.email)
            .select()
            .single();

          if (claimError) throw claimError;
          
          setProfile(updatedProfile);
          finalBcdb = await checkBcdb(updatedProfile.email || session?.user?.email, updatedProfile.roles || updatedProfile.role);
          const cachedObj = { userId, profile: updatedProfile, isBcdb: finalBcdb, at: Date.now() };
          globalProfileCache = cachedObj;
          return { profile: updatedProfile, isBcdb: finalBcdb };
        }
      }

      // 3. Fallback: Create new profile
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
      finalBcdb = await checkBcdb(newProfile.email || session?.user?.email, newProfile.roles || newProfile.role);
      const cachedObj = { userId, profile: newProfile, isBcdb: finalBcdb, at: Date.now() };
      globalProfileCache = cachedObj;
      return { profile: newProfile, isBcdb: finalBcdb };
    })();

    pendingProfilePromises.set(userId, fetchPromise);

    try {
      const result = await fetchPromise;
      setLoading(false);
      return result;
    } catch (err: any) {
      console.error("Profile Hook Error:", err.message || err);
      setError(err.message || "Failed to load profile");
    } finally {
      pendingProfilePromises.delete(userId);
      setLoading(false);
    }
  }, [session?.user?.id, lastCheckedId, session?.access_token, session?.user?.email, session?.user?.user_metadata?.full_name]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile(session.user.id);
    } else {
      setProfile(null);
      setIsBcdb(false);
      setLastCheckedId(null);
      setLoading(false);
      globalProfileCache = null;
    }
  }, [session?.user?.id, fetchProfile]);

  const activeProfile = (profile && profile.id === session?.user?.id) ? profile : (isCached ? globalProfileCache?.profile : null);
  const activeIsBcdb = (profile && profile.id === session?.user?.id) ? isBcdb : (isCached ? globalProfileCache?.isBcdb || false : false);
  const derivedLoading = !isCached && (loading || (!!session?.user?.id && lastCheckedId !== session.user.id));

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

