import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase"; // Main DB for auth
import { supabaseYt } from "@/lib/supabase-yt"; // YouTube DB for queries
import { getUserFromToken } from "@/lib/auth-utils";


export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "15"), 50);

  try {
    // --- Auth Check (local JWT decode — zero network) ---
    const authUser = getUserFromToken(request);
    let userId: string | null = null;
    let isAdmin = false;

    if (authUser) {
      userId = authUser.id;
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, roles')
        .eq('id', userId)
        .single();

      if (!profileError && profile) {
        const userRoles = Array.isArray(profile.roles) ? profile.roles : [profile.role].filter(r => r !== null);
        isAdmin = userRoles.includes(1);
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --- Helper: get channel IDs that have hide_shorts=true (returns empty Set if column missing) ---
    const getHiddenChannelIds = async (): Promise<Set<string>> => {
      try {
        const { data, error } = await supabase
          .from('youtube_channels')
          .select('channel_id')
          .eq('hide_shorts', true);
        if (error) return new Set();
        return new Set((data || []).map((c: any) => c.channel_id));
      } catch {
        return new Set();
      }
    };

    // --- Determine allowed channel IDs ---
    let finalChannelIds: string[] = [];
    const targetChannelId = searchParams.get("channelId");

    if (targetChannelId) {
      // Single-channel mode
      const hiddenIds = await getHiddenChannelIds();
      if (hiddenIds.has(targetChannelId)) {
        return NextResponse.json({ items: [] });
      }
      finalChannelIds = [targetChannelId];
    } else {
      // Multi-channel mode
      if (isAdmin) {
        const { data: allActiveChannels } = await supabase
          .from('youtube_channels')
          .select('channel_id')
          .eq('is_active', true);

        const hiddenIds = await getHiddenChannelIds();
        finalChannelIds = (allActiveChannels || [])
          .map((c: any) => c.channel_id)
          .filter((id: string) => !hiddenIds.has(id));
      } else {
        const { data: allowedChannels, error: rpcError } = await supabase.rpc('get_user_accessible_channels', {
          requesting_user_id: userId
        });

        if (rpcError) {
          console.error("[Shorts API] RPC Error fetching accessible channels:", rpcError);
          const { data: allChannels } = await supabase
            .from('youtube_channels')
            .select('channel_id')
            .eq('is_active', true);
          const hiddenIds = await getHiddenChannelIds();
          finalChannelIds = (allChannels || [])
            .map((c: any) => c.channel_id)
            .filter((id: string) => !hiddenIds.has(id));
        } else {
          const accessibleIds = (allowedChannels || []).map((c: any) => c.channel_id);
          const hiddenIds = await getHiddenChannelIds();
          finalChannelIds = accessibleIds.filter((id: string) => !hiddenIds.has(id));
        }
      }

      // Safety fallback
      if (finalChannelIds.length === 0) {
        const { data: fallbackChannels } = await supabase
          .from('youtube_channels')
          .select('channel_id')
          .eq('is_active', true);
        const hiddenIds = await getHiddenChannelIds();
        finalChannelIds = (fallbackChannels || [])
          .map((c: any) => c.channel_id)
          .filter((id: string) => !hiddenIds.has(id));
      }
    }

    if (finalChannelIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    // --- Balanced fetch: get shorts evenly from each channel ---
    // Shorts are stored with is_short = true in yt_videos (not kind = 'short')
    const perChannel = Math.max(2, Math.ceil(limit / finalChannelIds.length) + 1);

    // Shuffle channels so order varies each request
    const shuffledChannels = [...finalChannelIds].sort(() => Math.random() - 0.5);

    // Fetch from each channel in parallel
    const perChannelResults = await Promise.all(
      shuffledChannels.map(async (channelId) => {
        try {
          // Count total shorts for this channel to compute a random offset
          const { count } = await supabaseYt
            .from("yt_videos")
            .select("video_id", { count: "exact", head: true })
            .eq("channel_id", channelId)
            .eq("is_short", true);

          const total = count || 0;
          if (total === 0) return [];

          // Random offset so each refresh shows different videos
          const maxOffset = Math.max(0, total - perChannel);
          const randomOffset = Math.floor(Math.random() * maxOffset);

          const { data, error } = await supabaseYt
            .from("yt_videos")
            .select("video_id, title, thumbnail_url, published_at, channel_id")
            .eq("channel_id", channelId)
            .eq("is_short", true)
            .order("published_at", { ascending: false })
            .range(randomOffset, randomOffset + perChannel - 1);

          if (error) {
            console.error(`[Shorts API] Query error for channel ${channelId}:`, error);
            return [];
          }

          return (data || []).map((v: any) => ({
            id: v.video_id,
            title: v.title || "",
            thumbnail: v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`,
            published: v.published_at || "",
            channel_title: "",
            channel_id: v.channel_id || channelId,
          }));
        } catch (err) {
          console.error(`[Shorts API] Error fetching shorts for channel ${channelId}:`, err);
          return [];
        }
      })
    );

    // Interleave in round-robin so every channel is represented
    const interleaved: any[] = [];
    const maxLen = Math.max(0, ...perChannelResults.map(r => r.length));
    for (let i = 0; i < maxLen && interleaved.length < limit; i++) {
      for (const channelShorts of perChannelResults) {
        if (i < channelShorts.length && interleaved.length < limit) {
          interleaved.push(channelShorts[i]);
        }
      }
    }

    // Final shuffle so it doesn't look grouped by channel
    const finalShorts = interleaved.sort(() => Math.random() - 0.5);

    console.log(`[Shorts API] Returning ${finalShorts.length} shorts from ${perChannelResults.filter(r => r.length > 0).length}/${finalChannelIds.length} channels`);

    return NextResponse.json({ items: finalShorts });
  } catch (err) {
    console.error("Shorts fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch shorts" }, { status: 500 });
  }
}
