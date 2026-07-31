import { createClient } from "@supabase/supabase-js";
import { supabaseYtAdmin as supabaseYt } from "./supabase-yt";


const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CHUNK_SIZE = 100;

function isShortVideo(title?: string, description?: string): boolean {
  const t = (title || "").toLowerCase();
  const d = (description || "").toLowerCase();
  return t.includes("#shorts") || d.includes("#shorts") || t.includes("#short") || d.includes("#short") || t.includes("#reels") || d.includes("#reels");
}

function parseISO8601Duration(durationStr: string): number {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = (durationStr || "").match(regex);
  if (!matches) return 0;
  const hours = parseInt(matches[1] || "0", 10);
  const minutes = parseInt(matches[2] || "0", 10);
  const seconds = parseInt(matches[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Generic fetcher with YouTube API Key Fallback Rotation
async function fetchFromYouTubeWithFallback(urlInput: URL | string): Promise<{ response: Response; data: any }> {
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
    
    const apiUrl = typeof urlInput === "string" ? new URL(urlInput) : new URL(urlInput.toString());
    apiUrl.searchParams.set("key", key);

    try {
      const response = await fetch(apiUrl.toString(), { cache: "no-store" });
      const data = await response.json();

      if (response.ok) {
        if (i > 0) {
          console.log(`[YouTube Sync Key Rotation] Successfully fetched using fallback key: ${maskedKey}`);
        }
        return { response, data };
      }

      const isQuotaError = data.error?.errors?.some((e: any) => e.reason === "quotaExceeded") || 
                           data.error?.message?.includes("quota") || 
                           response.status === 403;

      if (isQuotaError) {
        console.warn(`[YouTube Sync Key Rotation] Quota exceeded for key: ${maskedKey}. Trying next key.`);
      } else {
        console.warn(`[YouTube Sync Key Rotation] API call failed for key: ${maskedKey} with status ${response.status}: ${data.error?.message}. Trying next key.`);
      }
      lastError = data;
    } catch (err: any) {
      console.error(`[YouTube Sync Key Rotation] Fetch exception for key: ${maskedKey}:`, err.message);
      lastError = err;
    }
  }

  throw new Error(lastError?.error?.message || lastError?.message || "All configured YouTube API keys are exhausted or failed");
}

async function fetchVideoDurations(videoIds: string[]): Promise<Record<string, number>> {
  const durations: Record<string, number> = {};
  if (videoIds.length === 0) return durations;
  
  for (let j = 0; j < videoIds.length; j += 50) {
    const batch = videoIds.slice(j, j + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("id", batch.join(","));
    try {
      const { data } = await fetchFromYouTubeWithFallback(url);
      if (data.items) {
        for (const item of data.items) {
          if (item.contentDetails?.duration) {
            durations[item.id] = parseISO8601Duration(item.contentDetails.duration);
          }
        }
      }
    } catch (err) {
      console.error("[BgSync] Failed to fetch video durations:", err);
    }
  }
  return durations;
}

async function upsertChunked(videos: any[], existingVideoIds: Set<string>) {
  let count = 0;
  for (let i = 0; i < videos.length; i += CHUNK_SIZE) {
    const chunk = videos.slice(i, i + CHUNK_SIZE);
    
    // Filter out videos that already exist in the database (or were synced in this run)
    const newVideosInChunk = chunk.filter(v => !existingVideoIds.has(v.video_id));
    if (newVideosInChunk.length === 0) {
      continue;
    }
    
    // Fetch durations only for new videos
    const videoIds = newVideosInChunk.map(v => v.video_id);
    const durations = await fetchVideoDurations(videoIds);
    
    // Enrich videos
    const enrichedChunk = newVideosInChunk.map(v => {
      const duration = durations[v.video_id] !== undefined ? durations[v.video_id] : null;
      
      // Exclude UCZ8S3qwowiFztAQBRTawWfA (Hare Krishna TV)
      const isHkTV = v.channel_id === 'UCZ8S3qwowiFztAQBRTawWfA';
      
      const isShort = !isHkTV && (duration !== null 
        ? duration <= 180 
        : v.is_short);

      return {
        ...v,
        duration_seconds: duration,
        is_short: isShort
      };
    });

    const { error } = await supabaseYt!
      .from("yt_videos")
      .upsert(enrichedChunk, { onConflict: "video_id", ignoreDuplicates: true });
    if (error) {
      console.error("[BgSync] Upsert error:", error.message);
    } else {
      count += enrichedChunk.length;
      // Add newly upserted IDs to our set to prevent redundant writes in future chunks/playlists
      enrichedChunk.forEach(v => existingVideoIds.add(v.video_id));
    }
  }
  return count;
}

async function fetchAllPlaylistVideos(
  playlistId: string, 
  channelId: string, 
  existingVideoIds: Set<string>,
  onProgress?: (total: number) => Promise<void>
): Promise<number> {
  let pageToken = "";
  let total = 0;
  do {
    // Abort check: Check if user stopped the sync in the DB
    try {
      const { data: currentStatus } = await supabaseYt!
        .from("youtube_channels")
        .select("sync_status")
        .eq("channel_id", channelId)
        .maybeSingle();
      
      if (currentStatus && currentStatus.sync_status !== "syncing") {
        console.log(`[BgSync] Sync status for ${channelId} is no longer "syncing" (status: ${currentStatus.sync_status}). Aborting video fetch.`);
        break;
      }
    } catch (dbErr) {
      console.warn("[BgSync] Abort check database read failed:", dbErr);
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const { data } = await fetchFromYouTubeWithFallback(url);
    const videos = (data.items || []).map((v: any) => ({
      video_id: v.contentDetails?.videoId,
      channel_id: channelId,
      title: v.snippet?.title || "Untitled",
      description: v.snippet?.description || "",
      thumbnail_url: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || null,
      published_at: v.contentDetails?.videoPublishedAt || v.snippet?.publishedAt || null,
      kind: "video",
      is_short: isShortVideo(v.snippet?.title, v.snippet?.description),
      updated_at: new Date().toISOString(),
    })).filter((v: any) => v.video_id && v.title !== "Private video" && v.title !== "Deleted video");

    const hasNewVideos = videos.some((v: any) => !existingVideoIds.has(v.video_id));

    // Fallback playlist thumbnail if it is missing or is the generic placeholder
    if (videos.length > 0 && !pageToken) {
      const firstPublicVideo = videos.find((v: any) => v.title !== "Private video" && v.title !== "Deleted video" && v.thumbnail_url);
      if (firstPublicVideo && firstPublicVideo.thumbnail_url) {
        (async () => {
          try {
            const { data: plData } = await supabaseYt!
              .from("yt_playlists")
              .select("thumbnail_url")
              .eq("playlist_id", playlistId)
              .maybeSingle();
              
            if (!plData || !plData.thumbnail_url || plData.thumbnail_url.includes("no_thumbnail.jpg")) {
              await supabaseYt!
                .from("yt_playlists")
                .update({ thumbnail_url: firstPublicVideo.thumbnail_url })
                .eq("playlist_id", playlistId);
              console.log(`[BgSync] Updated playlist ${playlistId} cover thumbnail with first public video's thumbnail.`);
            }
          } catch (err) {
            console.error("[BgSync] Failed to update playlist thumbnail:", err);
          }
        })();
      }
    }

    if (videos.length > 0) {
      total += await upsertChunked(videos, existingVideoIds);
      if (onProgress) {
        await onProgress(total);
      }
    }
    pageToken = data.nextPageToken || "";
    
    // Throttling: Add a delay to prevent exhausting Supabase Disk IO budget.
    // If we actually inserted new videos, wait 1000ms to let the DB flush. Otherwise, wait 100ms.
    if (pageToken) {
      const throttleTime = hasNewVideos ? 1000 : 100;
      await new Promise(resolve => setTimeout(resolve, throttleTime));
    }
  } while (pageToken);
  return total;
}

export async function syncYouTubeChannelFull(channelId: string) {
  console.log(`[BgSync] ===== Starting Full Background Sync for ${channelId} =====`);

  if (!supabaseYt) throw new Error("YouTube database client not initialized");

  // --- PRE-LOAD: Try reading from YT DB, fallback to Main DB if missing ---
  let channelInfo = null;
  const { data: ytChannel } = await supabaseYt.from("youtube_channels").select("name, visibility, hide_shorts").eq("channel_id", channelId).maybeSingle();
  if (ytChannel) {
    channelInfo = ytChannel;
  } else {
    // Only query Main DB if it doesn't exist in the YT DB yet
    console.log(`[BgSync] Channel not found in YT DB. Fetching from Main DB...`);
    const { data: mainChannel } = await supabase.from("youtube_channels").select("name, visibility, hide_shorts").eq("channel_id", channelId).single();
    if (mainChannel) {
      channelInfo = mainChannel;
      await supabaseYt.from("youtube_channels").upsert({
        channel_id: channelId,
        name: mainChannel.name,
        visibility: mainChannel.visibility,
        hide_shorts: mainChannel.hide_shorts || false
      });
    }
  }

  if (!channelInfo) throw new Error("Channel details not found in either database");

  // --- PRE-LOAD CACHE: Fetch all existing video IDs from DB to prevent heavy I/O and duplicate processing ---
  const existingVideoIds = new Set<string>();
  console.log(`[BgSync] Pre-loading existing video IDs from DB for channel ${channelId}...`);
  const { data: existingData, error: selectErr } = await supabaseYt
    .from("yt_videos")
    .select("video_id")
    .eq("channel_id", channelId);
  
  if (selectErr) {
    console.error("[BgSync] Failed to fetch existing video IDs:", selectErr);
  } else if (existingData) {
    existingData.forEach((v: any) => existingVideoIds.add(v.video_id));
    console.log(`[BgSync] Pre-loaded ${existingVideoIds.size} existing video IDs.`);
  }

  const engine = process.env.SYNC_ENGINE_NAME || 'local';

  await supabaseYt.from("youtube_channels").update({
    sync_status: "syncing",
    sync_error: null,
    metadata: { stage: "uploads", startedAt: new Date().toISOString(), engine }
  }).eq("channel_id", channelId);

  try {
    // --- STEP 1: Get channel details ---
    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelUrl.searchParams.set("id", channelId);
    channelUrl.searchParams.set("part", "contentDetails,statistics");
    const { data: cData } = await fetchFromYouTubeWithFallback(channelUrl);
    const uploadsPlaylistId = cData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    const totalOnYT = cData.items?.[0]?.statistics?.videoCount || "?";

    if (!uploadsPlaylistId) throw new Error("Could not find uploads playlist");
    console.log(`[BgSync] Channel has ~${totalOnYT} videos on YouTube. Starting main uploads sync...`);

    // --- STEP 2: Sync main Uploads playlist (all pages, no limit) ---
    let uploadsTotal = 0;
    await supabaseYt.from("youtube_channels").update({ metadata: { stage: "uploads", totalOnYT, engine } }).eq("channel_id", channelId);
    try {
      uploadsTotal = await fetchAllPlaylistVideos(uploadsPlaylistId, channelId, existingVideoIds, async (syncedSoFar) => {
        if (supabaseYt) {
          await supabaseYt.from("youtube_channels").update({ 
            metadata: { stage: "uploads", uploadsTotal: syncedSoFar, totalOnYT, engine } 
          }).eq("channel_id", channelId);
        }
      });
    } catch (upErr: any) {
      console.warn(`[BgSync] Uploads playlist fetch failed (channel might have 0 public videos):`, upErr.message);
    }
    console.log(`[BgSync] Uploads stage done. Synced ${uploadsTotal} videos.`);

    // --- STEP 3: Get all channel playlists ---
    console.log(`[BgSync] Starting deep playlist scan...`);
    await supabaseYt.from("youtube_channels").update({ metadata: { stage: "deep_scan", uploadsTotal, totalOnYT, engine } }).eq("channel_id", channelId);

    let allPlaylists: any[] = [];
    let plPageToken = "";
    do {
      const plUrl = new URL("https://www.googleapis.com/youtube/v3/playlists");
      plUrl.searchParams.set("channelId", channelId);
      plUrl.searchParams.set("part", "id,snippet,contentDetails");
      plUrl.searchParams.set("maxResults", "50");
      if (plPageToken) plUrl.searchParams.set("pageToken", plPageToken);

      const { data: pData } = await fetchFromYouTubeWithFallback(plUrl);
      if (pData.items) allPlaylists.push(...pData.items);
      plPageToken = pData.nextPageToken || "";
    } while (plPageToken);

    console.log(`[BgSync] Found ${allPlaylists.length} playlists. Scanning each...`);

    // Upsert playlist records
    const playlistRecords = allPlaylists.map((pl: any) => ({
      playlist_id: pl.id,
      channel_id: channelId,
      title: pl.snippet?.title,
      thumbnail_url: pl.snippet?.thumbnails?.high?.url || pl.snippet?.thumbnails?.medium?.url,
      video_count: pl.contentDetails?.itemCount,
      updated_at: new Date().toISOString()
    }));
    if (playlistRecords.length > 0) {
      await supabaseYt.from("yt_playlists").upsert(playlistRecords, { onConflict: "playlist_id" });
    }

    // --- STEP 4: Sync each playlist ---
    let deepTotal = 0;
    for (let i = 0; i < allPlaylists.length; i++) {
      // Abort check: Check if user stopped the sync in the DB (every 5 playlists to save DB capacity)
      if (i % 5 === 0) {
        try {
          const { data: currentStatus } = await supabaseYt
            .from("youtube_channels")
            .select("sync_status")
            .eq("channel_id", channelId)
            .maybeSingle();
          
          if (currentStatus && currentStatus.sync_status !== "syncing") {
            console.log(`[BgSync] Sync status for ${channelId} is no longer "syncing" (status: ${currentStatus.sync_status}). Aborting deep scan.`);
            return;
          }
        } catch (dbErr) {
          console.warn("[BgSync] Playlist-loop abort check failed:", dbErr);
        }
      }

      const pl = allPlaylists[i];
      try {
        const count = await fetchAllPlaylistVideos(pl.id, channelId, existingVideoIds);
        deepTotal += count;
        console.log(`[BgSync] Playlist ${i + 1}/${allPlaylists.length} "${pl.snippet?.title}": +${count} videos (total new: ${deepTotal})`);
      } catch (plErr: any) {
        console.error(`[BgSync] Failed to sync playlist ${pl.id} ("${pl.snippet?.title}"):`, plErr.message);
      }
      
      // Update progress in DB so admin can see it - ONLY every 10 playlists to save Disk IO budget
      if (i % 10 === 0 || i === allPlaylists.length - 1) {
        await supabaseYt.from("youtube_channels").update({
          metadata: { 
            stage: "deep_scan", 
            playlistProgress: `${i + 1}/${allPlaylists.length}`,
            deepTotal,
            uploadsTotal,
            totalOnYT,
            engine
          }
        }).eq("channel_id", channelId);
      }
    }

    // --- STEP 5: Mark completed ---
    const grandTotal = uploadsTotal + deepTotal;
    console.log(`[BgSync] ===== COMPLETE! Total synced: ${grandTotal} videos =====`);
    await supabaseYt.from("youtube_channels").update({
      sync_status: "completed",
      last_sync_at: new Date().toISOString(),
      sync_cursor: null,
      sync_error: null,
      metadata: { stage: "completed", grandTotal, uploadsTotal, deepTotal, totalOnYT, engine }
    }).eq("channel_id", channelId);

  } catch (err: any) {
    console.error(`[BgSync] FATAL ERROR for ${channelId}:`, err.message);
    await supabaseYt.from("youtube_channels").update({
      sync_status: "error",
      sync_error: err.message
    }).eq("channel_id", channelId);
  }
}
