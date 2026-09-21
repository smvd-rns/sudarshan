import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";
import { redis } from "@/lib/redis";
import { invalidateCache, CacheKeys } from "@/lib/cache";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/cache/clear
 *
 * Clears specific or all Redis cache keys.
 * Admin-only. Useful after data changes (e.g. restoring logo URLs).
 *
 * Body (optional): { keys: ["channels", "channelMeta", "all"] }
 * If no body / empty, defaults to clearing channels cache.
 */
export async function POST(request: NextRequest) {
  // Auth check — admin only
  const user = getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, roles")
    .eq("id", user.id)
    .single();

  const roles = (Array.isArray(profile?.roles) ? profile.roles : [profile?.role]).filter(r => r != null).map(Number);
  const isAdmin = roles.includes(1);

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden — Admin only" }, { status: 403 });
  }

  if (!redis) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const requested: string[] = body.keys || ["channels"]; // default: clear channels

  const cleared: string[] = [];
  const failed: string[] = [];

  const clearKey = async (key: string, staleKey: string) => {
    try {
      await redis!.del(key);
      await redis!.del(staleKey); // Also clear stale backup so no stale base64 is served
      cleared.push(key);
    } catch (e: any) {
      failed.push(key);
    }
  };

  // --- Clear channel list cache ---
  if (requested.includes("channels") || requested.includes("all")) {
    await clearKey(CacheKeys.channelsPublic, `stale:${CacheKeys.channelsPublic}`);
  }

  // --- Clear all channel meta caches ---
  if (requested.includes("channelMeta") || requested.includes("all")) {
    try {
      const { data: allChannels } = await supabase
        .from("youtube_channels")
        .select("channel_id")
        .eq("is_active", true);

      if (allChannels) {
        await Promise.all(
          allChannels.map(ch => {
            const key = CacheKeys.channelMeta(ch.channel_id);
            return clearKey(key, `stale:${key}`);
          })
        );
      }
    } catch (e: any) {
      failed.push("channelMeta batch");
    }
  }

  // --- Clear all user role caches (if requested) ---
  if (requested.includes("userRoles") || requested.includes("all")) {
    try {
      // Scan for user:*:role keys and delete them
      let cursor = 0;
      do {
        const result = await (redis as any).scan(cursor, { match: "user:*:role", count: 100 });
        cursor = result[0];
        const keys: string[] = result[1];
        if (keys.length > 0) {
          await Promise.all(keys.map((k: string) => redis!.del(k)));
          cleared.push(...keys);
        }
      } while (cursor !== 0);
    } catch (e: any) {
      failed.push("userRoles batch");
    }
  }

  return NextResponse.json({
    success: true,
    message: "Cache cleared successfully",
    cleared,
    failed,
    timestamp: new Date().toISOString()
  });
}
