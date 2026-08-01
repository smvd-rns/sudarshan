import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { warmCache, CacheKeys } from "@/lib/cache";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/cache/warm
 *
 * Lightweight cache warming endpoint — called by your external cron job every 12 hours.
 * Fetches fresh data from Main DB and saves it to Redis.
 * No YouTube API calls. No heavy sync. Just DB → Redis.
 *
 * Your external cron:
 *   URL: https://yoursite.com/api/cache/warm
 *   Method: GET
 *   Header: Authorization: Bearer {CRON_SECRET}
 *   Schedule: every 12 hours
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  // Secured with the same CRON_SECRET as the sync-all endpoint
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results: Record<string, string> = {};

  // 1. Warm public channel list (most critical — used by home page for all users)
  try {
    const { data: channels, error } = await supabase
      .from("youtube_channels")
      .select("*")
      .eq("is_active", true)
      .eq("visibility", "public")
      .order("order_index", { ascending: true });

    if (error) throw error;

    if (channels && channels.length > 0) {
      await warmCache(CacheKeys.channelsPublic, channels, 86400); // 24hr
      results.channelsPublic = `✅ Warmed (${channels.length} channels)`;
    } else {
      results.channelsPublic = "⚠️ No active public channels found";
    }
  } catch (err: any) {
    results.channelsPublic = `❌ Failed: ${err.message}`;
    console.error("[Cache Warm] Channel list warming failed:", err.message);
  }

  // 2. Warm individual channel meta (visibility + logo) for each channel
  // This is used by the video listing page privacy check
  try {
    const { data: allChannels } = await supabase
      .from("youtube_channels")
      .select("channel_id, id, name, custom_logo, visibility")
      .eq("is_active", true);

    if (allChannels && allChannels.length > 0) {
      // Run Redis writes in parallel to prevent timeouts
      await Promise.all(
        allChannels.map(ch =>
          warmCache(
            CacheKeys.channelMeta(ch.channel_id),
            { id: ch.id, name: ch.name, custom_logo: ch.custom_logo, visibility: ch.visibility },
            7200 // 2hr
          )
        )
      );
      results.channelMeta = `✅ Warmed (${allChannels.length} channel meta entries)`;
    }
  } catch (err: any) {
    results.channelMeta = `❌ Failed: ${err.message}`;
    console.error("[Cache Warm] Channel meta warming failed:", err.message);
  }

  console.log("[Cache Warm] Completed:", results);

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    results
  });
}
