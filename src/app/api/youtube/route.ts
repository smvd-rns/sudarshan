import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseYt } from "@/lib/supabase-yt";
import { redis } from "@/lib/redis";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CACHE_SECONDS = 1800; // 30 minutes

interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  date: string;
  published: string;
  type: "video" | "live" | "short";
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks !== 1 ? "s" : ""} ago`;
  if (diffMonths < 12) return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Production-grade YouTube API Fetcher with Multi-API-Key Failover Rotation
async function fetchFromYouTubeWithFallback(apiUrl: URL): Promise<{ response: Response; data: any }> {
  const keys = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_API_KEY_FALLBACK
  ].filter(Boolean) as string[];

  if (keys.length === 0) {
    throw new Error("YouTube API Keys are missing in configuration");
  }

  let lastError = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const maskedKey = `${key.substring(0, 5)}...${key.substring(key.length - 4)}`;
    apiUrl.searchParams.set("key", key);

    try {
      const response = await fetch(apiUrl.toString(), { cache: "no-store" });
      const data = await response.json();

      if (response.ok) {
        if (i > 0) {
          console.log(`[YouTube API Key Rotation] Successfully fetched using fallback key: ${maskedKey}`);
        }
        return { response, data };
      }

      const isQuotaError = data.error?.errors?.some((e: any) => e.reason === "quotaExceeded") || 
                           data.error?.message?.includes("quota") || 
                           response.status === 403;

      if (isQuotaError) {
        console.warn(`[YouTube API Key Rotation] Quota exceeded for key: ${maskedKey}. Trying next key.`);
      } else {
        console.warn(`[YouTube API Key Rotation] API call failed for key: ${maskedKey} with status ${response.status}: ${data.error?.message}. Trying next key.`);
      }
      lastError = data;
    } catch (err: any) {
      console.error(`[YouTube API Key Rotation] Fetch exception for key: ${maskedKey}:`, err.message);
      lastError = err;
    }
  }

  throw new Error(lastError?.error?.message || lastError?.message || "All configured YouTube API keys are exhausted or failed");
}

export async function GET(request: NextRequest) {
  // --- Enforce Authentication ---
  const authHeader = request.headers.get("Authorization");
  let userId = null;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (user && !authError) {
      userId = user.id;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const channelId = searchParams.get("channelId");
  const playlistId = searchParams.get("playlistId"); // For entering a playlist
  const type = searchParams.get("type") ?? "videos";
  let pageToken = searchParams.get("pageToken") ?? "";
  if (pageToken === "undefined" || pageToken === "null") {
    pageToken = "";
  }
  let offset = 0;
  let googlePageToken = "";
  const maxResults = Math.min(parseInt(searchParams.get("maxResults") ?? "50"), 50);

  // Handle single video fetch if videoId is provided
  if (videoId) {
    const videoCacheKey = `yt:video:${videoId}`;
    if (redis) {
      try {
        const cached = await redis.get(videoCacheKey);
        if (cached) {
          return NextResponse.json(cached);
        }
      } catch (err) {
        console.error("Redis Cache Read Error (video details):", err);
      }
    }

    try {
      // 1. Try DB first
      const { data: videoRecord } = await supabaseYt
        .from("yt_videos")
        .select("*")
        .eq("video_id", videoId)
        .maybeSingle();

      if (videoRecord) {
        const videoData = {
          id: videoRecord.video_id,
          title: videoRecord.title,
          thumbnail: videoRecord.thumbnail_url || `https://i.ytimg.com/vi/${videoRecord.video_id}/mqdefault.jpg`,
          date: videoRecord.published_at ? formatRelativeDate(videoRecord.published_at) : "",
          published: videoRecord.published_at ?? "",
          type: videoRecord.kind || "video"
        };

        if (redis) {
          try {
            await redis.set(videoCacheKey, videoData, { ex: 86400 }); // Cache details for 24 hours
          } catch (cacheErr) {
            console.error("Redis Cache Write Error (video details):", cacheErr);
          }
        }

        return NextResponse.json(videoData);
      }

      // 2. Try YouTube API with Fallback rotation
      const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      apiUrl.searchParams.set("id", videoId);
      apiUrl.searchParams.set("part", "snippet,contentDetails");

      const { data } = await fetchFromYouTubeWithFallback(apiUrl);
      const item = data.items?.[0];

      if (!item) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
      }

      const snippet = item.snippet;
      const videoData = {
        id: item.id,
        title: snippet.title,
        thumbnail: snippet.thumbnails?.maxres?.url ?? 
                   snippet.thumbnails?.high?.url ?? 
                   snippet.thumbnails?.medium?.url ?? 
                   `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`,
        date: snippet.publishedAt ? formatRelativeDate(snippet.publishedAt) : "",
        published: snippet.publishedAt ?? "",
        type: "video"
      };

      if (redis) {
        try {
          await redis.set(videoCacheKey, videoData, { ex: 86400 }); // Cache details for 24 hours
        } catch (cacheErr) {
          console.error("Redis Cache Write Error (video details):", cacheErr);
        }
      }

      return NextResponse.json(videoData);
    } catch (err) {
      console.error("Single video fetch error:", err);
      return NextResponse.json({ error: "Failed to fetch video details" }, { status: 500 });
    }
  }


  if (!channelId && !playlistId) {
    return NextResponse.json({ error: "Missing identity parameter" }, { status: 400 });
  }

  let channelTitle = "";
  let channelLogo = "";

  try {
    // Step 1: If we have a channelId, get basic info and check privacy
    if (channelId) {
      // PRIVACY CHECK: Verify if channel is private
      const { data: channelMeta } = await supabase
        .from("youtube_channels")
        .select("id, name, custom_logo, visibility")
        .eq("channel_id", channelId)
        .single();
      
      if (channelMeta) {
        channelTitle = channelMeta.name || "";
        channelLogo = channelMeta.custom_logo || "";

        if (channelMeta.visibility === 'private') {
          const authHeader = request.headers.get("Authorization");
          let hasAccess = false;
          
          if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            const { data: { user } } = await supabase.auth.getUser(token);
            if (user) {
              const { data: profile } = await supabase.from("profiles").select("role, roles").eq("id", user.id).single();
              const roles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r !== null && r !== undefined);
              const isSuperAdmin = roles.includes(1);
              
              if (isSuperAdmin) {
                hasAccess = true;
              } else {
                const { data: assignment } = await supabase
                  .from("youtube_channel_assignments")
                  .select("id")
                  .eq("channel_id", channelMeta.id)
                  .eq("user_id", user.id)
                  .single();
                if (assignment) hasAccess = true;
              }
            }
          }
          
          if (!hasAccess) {
            return NextResponse.json({ error: "Private Channel: Access Restricted" }, { status: 403 });
          }
        }
      }
    }

    const cacheKey = `yt:list:${channelId ?? ""}:${playlistId ?? ""}:${type}:${pageToken}:${maxResults}`;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          console.log(`[YouTube Cache] Serving cached result from Redis for key: ${cacheKey}`);
          return NextResponse.json(cached);
        }
      } catch (err) {
        console.error("Redis Cache Read Error (list):", err);
      }
    }

    // Parse combined pageToken (format: "offset:googleToken" or just "offset" or just "googleToken")

    if (pageToken) {
      if (pageToken.includes(":")) {
        const parts = pageToken.split(":");
        offset = parseInt(parts[0]) || 0;
        googlePageToken = parts[1] || "";
      } else if (/^\d+$/.test(pageToken)) {
        offset = parseInt(pageToken) || 0;
      } else {
        googlePageToken = pageToken;
      }
    }

    const isPage1 = !pageToken || pageToken === "" || pageToken === "undefined" || pageToken === "null";

    // Step 2: Determine if we should query the database directly
    let useDatabase = false;
    let dbItems: any[] = [];
    let nextOffsetToken = "";

    if (!playlistId && channelId) {
      // HYBRID ARCHITECTURE:
      // - Playlists are always loaded from database first (saving quota).
      // - Load more (page 2, 3, etc.) are always loaded from database first (saving quota).
      // - Page 1 of Videos/Live will bypass this block, hitting Google directly (1 token) for live real-time videos, but automatically falls back here if Google fails!
      if (type === "playlists" || !isPage1) {
        if (type === "playlists") {
          const { data: playlists } = await supabaseYt
            .from("yt_playlists")
            .select("*")
            .eq("channel_id", channelId)
            .order("created_at", { ascending: false })
            .range(offset, offset + maxResults - 1);
          
          if (playlists && playlists.length > 0) {
            useDatabase = true;
            dbItems = playlists.map(pl => ({
              id: pl.playlist_id,
              title: pl.title || "Untitled",
              thumbnail: pl.thumbnail_url || "",
              date: pl.created_at ? formatRelativeDate(pl.created_at) : "",
              published: pl.created_at || "",
              type: "playlist",
              playlistCount: pl.video_count || 0
            }));
            if (playlists.length === maxResults) {
              nextOffsetToken = String(offset + maxResults);
            }
          }
        } else {
          // Videos / Live - subsequent pages
          let dbQuery = supabaseYt
            .from("yt_videos")
            .select("*")
            .eq("channel_id", channelId)
            .neq("title", "Private video")
            .neq("title", "Deleted video")
            .order("published_at", { ascending: false });

          if (type === "live") {
            dbQuery = dbQuery.eq("kind", "live");
          }

          const { data: dbVideos } = await dbQuery.range(offset, offset + maxResults - 1);
          
          if (dbVideos && dbVideos.length > 0) {
            useDatabase = true;
            dbItems = dbVideos.map(vid => ({
              id: vid.video_id,
              title: vid.title || "Untitled",
              thumbnail: vid.thumbnail_url || `https://i.ytimg.com/vi/${vid.video_id}/mqdefault.jpg`,
              date: vid.published_at ? formatRelativeDate(vid.published_at) : "",
              published: vid.published_at || "",
              type: vid.kind || "video",
              playlistCount: undefined
            }));
            if (dbVideos.length === maxResults) {
              nextOffsetToken = String(offset + maxResults) + (googlePageToken ? ":" + googlePageToken : "");
            }
          }
        }
      }
    }

    if (useDatabase) {
      console.log(`[YouTube API Route] Serving cached ${type} from database (offset: ${offset}, googleToken: ${googlePageToken})`);
      return NextResponse.json(
        {
          items: dbItems,
          nextPageToken: nextOffsetToken,
          channelTitle,
          channelLogo,
        },
        { headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60` } }
      );
    }

    // Step 3: Google YouTube API Fetch with key rotation (used for Page 1 of Videos/Live, or specific playlists)
    let apiUrl: URL;

    if (playlistId) {
      apiUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      apiUrl.searchParams.set("playlistId", playlistId);
      apiUrl.searchParams.set("part", "snippet,contentDetails");
    } else if (type === "playlists") {
      apiUrl = new URL("https://www.googleapis.com/youtube/v3/playlists");
      apiUrl.searchParams.set("channelId", channelId!);
      apiUrl.searchParams.set("part", "snippet,contentDetails");
    } else {
      // DEFAULT: Use the uploads playlist for Videos/Live
      const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
      channelUrl.searchParams.set("id", channelId!);
      // Fetch snippet to get channel title and channel logo (profile photo)
      channelUrl.searchParams.set("part", "snippet,contentDetails");
      
      const { data: cData } = await fetchFromYouTubeWithFallback(channelUrl);
      const channelItem = cData.items?.[0];
      
      if (channelItem) {
        if (!channelTitle && channelItem.snippet?.title) {
          channelTitle = channelItem.snippet.title;
        }
        if (!channelLogo && channelItem.snippet?.thumbnails) {
          channelLogo = channelItem.snippet.thumbnails.high?.url ||
                        channelItem.snippet.thumbnails.medium?.url ||
                        channelItem.snippet.thumbnails.default?.url || "";
        }
      }
      
      const uploadsId = channelItem?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsId) {
        return NextResponse.json({ error: "Uploads playlist not found for channel" }, { status: 404 });
      }

      apiUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      apiUrl.searchParams.set("playlistId", uploadsId);
      apiUrl.searchParams.set("part", "snippet,contentDetails");
    }

    apiUrl.searchParams.set("maxResults", String(maxResults));
    if (googlePageToken) apiUrl.searchParams.set("pageToken", googlePageToken);

    // Fetch using rotation
    const { data } = await fetchFromYouTubeWithFallback(apiUrl);

    const mappedItems = (data.items ?? [])
      .map((item: any) => {
        const snippet = item.snippet;
        if (!snippet) return null;

        const title = snippet.title ?? "";
        if (title === "Private video" || title === "Deleted video") return null;

        const isPlaylistItems = !!playlistId;
        const isPlaylistTab = type === "playlists" && !isPlaylistItems;

        let id = "";
        if (isPlaylistTab) {
          id = item.id;
        } else if (isPlaylistItems) {
          id = item.contentDetails?.videoId ?? snippet.resourceId?.videoId ?? (typeof item.id === 'string' ? item.id : item.id?.videoId);
        } else {
          id = item.id?.videoId ?? snippet.resourceId?.videoId ?? (typeof item.id === 'string' ? item.id : item.id?.videoId);
        }

        if (!id) return null;

        // Safeguard: YouTube video IDs are always exactly 11 characters.
        // If it's not 11 characters, it's a playlistItem ID or malformed (won't play), so we filter it out.
        if (!isPlaylistTab && id.length !== 11) return null;

        const isLiveNow = snippet.liveBroadcastContent === "live" || snippet.liveBroadcastContent === "completed";
        if (type === "live" && !isLiveNow) return null;

        return {
          id,
          title: title || "Untitled",
          thumbnail: snippet.thumbnails?.maxres?.url ??
            snippet.thumbnails?.high?.url ??
            snippet.thumbnails?.medium?.url ??
            `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
          date: snippet.publishedAt ? formatRelativeDate(snippet.publishedAt) : "",
          published: snippet.publishedAt ?? "",
          type: isPlaylistTab ? "playlist" : (isLiveNow ? "live" : "video"),
          playlistCount: item.contentDetails?.itemCount,
        };
      })
      .filter(Boolean);

    // REAL-TIME AUTO-CACHE:
    // In the background, upsert these page 1 videos into the database to keep it fresh
    if (mappedItems.length > 0 && channelId && !playlistId) {
      const dbRecords = mappedItems.map((item: any) => ({
        video_id: item.id,
        channel_id: channelId,
        title: item.title,
        description: "",
        thumbnail_url: item.thumbnail,
        published_at: item.published,
        kind: type === "live" ? "live" : "video",
        updated_at: new Date().toISOString()
      }));

      // REAL-TIME AUTO-CACHE:
      // In the background, upsert these page 1 videos into the database to keep it fresh
      (async () => {
        try {
          const { error } = await supabaseYt.from("yt_videos")
            .upsert(dbRecords, { onConflict: "video_id", ignoreDuplicates: true });
          if (error) console.error("[Real-Time Sync] Background auto-cache failed:", error.message);
          else console.log("[Real-Time Sync] Background auto-cache succeeded for channel", channelId);
        } catch (err: any) {
          console.error("[Real-Time Sync] Background auto-cache uncaught error:", err?.message || err);
        }
      })();
    }

    let responseNextToken = "";
    if (!playlistId) {
      if (mappedItems.length === maxResults) {
        const nextOffset = offset + maxResults;
        responseNextToken = String(nextOffset) + (data.nextPageToken ? ":" + data.nextPageToken : "");
      }
    } else {
      responseNextToken = data.nextPageToken ?? "";
    }

    const listResult = {
      items: mappedItems,
      nextPageToken: responseNextToken,
      channelTitle,
      channelLogo,
    };

    if (redis) {
      try {
        await redis.set(cacheKey, listResult, { ex: 1800 }); // Cache for 30 minutes
      } catch (cacheErr) {
        console.error("Redis Cache Write Error (list):", cacheErr);
      }
    }

    return NextResponse.json(
      listResult,
      { headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60` } }
    );
  } catch (error: any) {
    console.error("API error:", error);
    // Ultimate fallback: Try to serve whatever we can from database
    try {
      if (channelId) {
        let fallbackItems: any[] = [];
        let nextOffsetToken = "";

        if (type === "playlists") {
          const { data: playlists } = await supabaseYt
            .from("yt_playlists")
            .select("*")
            .eq("channel_id", channelId)
            .order("created_at", { ascending: false })
            .range(offset, offset + maxResults - 1);
          if (playlists) {
            fallbackItems = playlists.map(pl => ({
              id: pl.playlist_id,
              title: pl.title || "Untitled",
              thumbnail: pl.thumbnail_url || "",
              date: pl.created_at ? formatRelativeDate(pl.created_at) : "",
              published: pl.created_at || "",
              type: "playlist",
              playlistCount: pl.video_count || 0
            }));
            if (playlists.length === maxResults) {
              nextOffsetToken = String(offset + maxResults);
            }
          }
        } else {
          const { data: dbVideos } = await supabaseYt
            .from("yt_videos")
            .select("*")
            .eq("channel_id", channelId)
            .order("published_at", { ascending: false })
            .range(offset, offset + maxResults - 1);
          if (dbVideos) {
            fallbackItems = dbVideos.map(vid => ({
              id: vid.video_id,
              title: vid.title || "Untitled",
              thumbnail: vid.thumbnail_url || `https://i.ytimg.com/vi/${vid.video_id}/mqdefault.jpg`,
              date: vid.published_at ? formatRelativeDate(vid.published_at) : "",
              published: vid.published_at || "",
              type: vid.kind || "video",
              playlistCount: undefined
            }));
            if (dbVideos.length === maxResults) {
              nextOffsetToken = String(offset + maxResults) + (googlePageToken ? ":" + googlePageToken : "");
            }
          }
        }

        return NextResponse.json({
          items: fallbackItems,
          nextPageToken: nextOffsetToken,
          channelTitle,
          channelLogo
        });
      }
    } catch (dbErr) {
      console.error("Double failure in fallback:", dbErr);
    }
    
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
