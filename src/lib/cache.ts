import { redis } from "./redis";

/**
 * Ashram Connect — Smart Redis Cache Layer
 *
 * Implements a "stale-on-error" pattern:
 * - Normal flow:  Redis hit → return immediately (no DB call)
 * - Cache miss:   Fetch from DB → write to Redis (regular + stale backup) → return
 * - DB fails:     Serve from stale backup key (7-day TTL) → extend it → return
 *
 * This means even if Main DB is down for hours, already-cached data
 * keeps serving users without any errors.
 */

const STALE_KEY_TTL = 7 * 24 * 3600; // 7 days — emergency backup TTL
const STALE_EXTEND_TTL = 3600;        // 1 hour — how long to extend stale cache per failed attempt

function staleKey(key: string): string {
  return `stale:${key}`;
}

/**
 * Get a cached value, or fetch it from the DB.
 * If DB fetch fails, falls back to a long-lived stale copy.
 */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {

  // 1. Try regular Redis cache
  if (redis) {
    try {
      const cached = await redis.get<T>(key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
    } catch (redisErr) {
      console.warn(`[Cache] Redis read failed for "${key}":`, redisErr);
    }
  }

  // 2. Cache miss — fetch fresh data from DB
  try {
    const freshData = await fetcher();

    if (redis && freshData !== null && freshData !== undefined) {
      try {
        // Write regular cache
        await redis.set(key, freshData, { ex: ttlSeconds });
        // Write stale backup (7 days) — used as emergency fallback if DB goes down
        await redis.set(staleKey(key), freshData, { ex: STALE_KEY_TTL });
      } catch (redisWriteErr) {
        console.warn(`[Cache] Redis write failed for "${key}":`, redisWriteErr);
      }
    }

    return freshData;
  } catch (fetchErr) {

    // 3. DB failed — serve stale backup if available
    console.warn(`[Cache] DB fetch failed for "${key}". Attempting stale fallback...`);

    if (redis) {
      try {
        const staleData = await redis.get<T>(staleKey(key));
        if (staleData !== null && staleData !== undefined) {
          console.warn(`[Cache] ✅ Serving stale data for "${key}". Extending cache TTL.`);
          // Restore the regular key temporarily so next requests hit cache not DB
          await redis.set(key, staleData, { ex: STALE_EXTEND_TTL });
          // Keep the stale backup fresh
          await redis.set(staleKey(key), staleData, { ex: STALE_KEY_TTL });
          return staleData;
        }
      } catch (staleErr) {
        console.error(`[Cache] ❌ Stale fallback also failed for "${key}":`, staleErr);
      }
    }

    // No stale data available — propagate original error
    throw fetchErr;
  }
}

/**
 * Delete one or more cache keys from Redis.
 * Called when admin makes a change to ensure fresh data is loaded next time.
 * NOTE: stale backup keys are intentionally preserved for emergency fallback.
 */
export async function invalidateCache(...keys: string[]): Promise<void> {
  if (!redis) return;
  try {
    for (const key of keys) {
      await redis.del(key);
      // Do NOT delete staleKey(key) — it stays as emergency fallback
    }
    console.log(`[Cache] Invalidated keys: ${keys.join(", ")}`);
  } catch (err) {
    console.warn("[Cache] Cache invalidation failed:", err);
  }
}

/**
 * Proactively write data into Redis cache (used by cron warming endpoint).
 * Writes both the regular key and the stale backup.
 */
export async function warmCache<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  if (!redis || data === null || data === undefined) return;
  try {
    await redis.set(key, data, { ex: ttlSeconds });
    await redis.set(staleKey(key), data, { ex: STALE_KEY_TTL });
    console.log(`[Cache] Warmed key: "${key}" (TTL: ${ttlSeconds}s)`);
  } catch (err) {
    console.warn(`[Cache] warmCache failed for "${key}":`, err);
  }
}

// ─── Cache Key Constants ──────────────────────────────────────────────────────
// Centralised here so all routes use consistent key names.

export const CacheKeys = {
  channelsPublic: "channels:public",
  channelMeta: (channelId: string) => `channel:meta:${channelId}`,
  userRole: (userId: string) => `user:${userId}:role`,
  userAssignments: (userId: string) => `user:${userId}:assignments`,
  bcdbVerified: (email: string) => `bcdb:${email.toLowerCase().trim()}`,
  watchLater: (userId: string) => `user:${userId}:watchlater`,
  favChannels: (userId: string) => `user:${userId}:favchannels`,
} as const;
