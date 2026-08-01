import { createClient } from "@supabase/supabase-js";
import { supabaseYtAdmin as supabaseYt } from "./supabase-yt";
import { safeQuery } from "./resilient-db";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const UPSERT_CHUNK_SIZE = 50;

type SyncOptions = {
  startPageToken?: string;
  maxPages?: number;
};

function isShortVideo(title?: string, description?: string): boolean {
  const t = (title || "").toLowerCase();
  const d = (description || "").toLowerCase();
  return t.includes("#shorts") || d.includes("#shorts") || t.includes("#short") || d.includes("#short") || t.includes("#reels") || d.includes("#reels");
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

async function readSavedCursor(channelId: string) {
  if (!supabaseYt) return "";
  // sync_cursor only exists in the YT DB (after yt_db_channels_migration.sql)
  const { data, error } = await supabaseYt
    .from("youtube_channels")
    .select("sync_cursor")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.sync_cursor || "";
}

async function saveCursorState(channelId: string, cursor: string | null) {
  if (!supabaseYt) return;
  // sync_cursor only exists in the YT DB (after yt_db_channels_migration.sql)
  const { error } = await supabaseYt
    .from("youtube_channels")
    .update({ sync_cursor: cursor, sync_error: null })
    .eq("channel_id", channelId);
  if (error) {
    const msg = String(error.message || "");
    if (error.code === "42703" || msg.includes("sync_cursor")) {
      console.warn("[YouTube Sync] sync_cursor column missing in YT DB. Run yt_db_channels_migration.sql.");
      return;
    }
    throw error;
  }
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

async function fetchVideoDurations(videoIds: string[]): Promise<Record<string, number>> {
  const durations: Record<string, number> = {};
  if (videoIds.length === 0) return durations;
  
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", videoIds.join(","));
  
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
    console.error("[YouTube Sync] Failed to fetch video durations:", err);
  }
  
  return durations;
}

async function upsertVideosInChunks(videos: any[], existingVideoIds: Set<string>) {
  let processed = 0;
  for (let i = 0; i < videos.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = videos.slice(i, i + UPSERT_CHUNK_SIZE);
    
    // Filter out videos that already exist in the database (or were synced in this run)
    const newVideosInChunk = chunk.filter(v => !existingVideoIds.has(v.video_id));
    if (newVideosInChunk.length === 0) {
      continue;
    }
    
    // Fetch durations for this chunk of videos
    const videoIds = newVideosInChunk.map(v => v.video_id);
    const durations = await fetchVideoDurations(videoIds);
    
    // Enrich with duration and accurate is_short status
    const enrichedChunk = newVideosInChunk.map(v => {
      const duration = durations[v.video_id] !== undefined ? durations[v.video_id] : null;
      
      // Exclude UCZ8S3qwowiFztAQBRTawWfA (Hare Krishna TV)
      const isHkTV = v.channel_id === 'UCZ8S3qwowiFztAQBRTawWfA';
      
      const isShort = !isHkTV && (duration !== null 
        ? duration <= 180 
        : v.is_short); // Fallback to hashtag check if API query fails

      return {
        ...v,
        duration_seconds: duration,
        is_short: isShort
      };
    });

    const { error: upsertError } = await safeQuery(
      async () =>
        await supabaseYt!
          .from("yt_videos")
          // Avoid expensive updates for already-synced rows.
          .upsert(enrichedChunk, { onConflict: "video_id", ignoreDuplicates: true }),
      `Upsert Videos Chunk ${Math.floor(i / UPSERT_CHUNK_SIZE) + 1}`
    );

    if (upsertError) throw upsertError;
    processed += chunk.length;
    // Add newly upserted IDs to our set
    enrichedChunk.forEach(v => existingVideoIds.add(v.video_id));
  }
  return processed;
}

export async function syncYouTubeChannel(channelId: string, isIncremental = false, options: SyncOptions = {}) {
  if (!channelId) throw new Error("Missing channelId");

  const keys = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_API_KEY_FALLBACK
  ].filter(Boolean) as string[];
  if (keys.length === 0) throw new Error("YouTube API Keys missing");
  if (!supabaseYt) throw new Error("YouTube database client not initialized");

  // 1. Get current sync state from DB (try YT DB first, fallback to Main DB if missing)
  let channelData = null;
  const { data: ytChannelData, error: fetchErr } = await supabaseYt
    .from("youtube_channels")
    .select("sync_cursor, sync_status, metadata")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;

  if (ytChannelData) {
    channelData = ytChannelData;
  } else {
    // Only query Main DB if channel doesn't exist in YT DB yet.
    // NOTE: Main DB youtube_channels does NOT have sync_cursor/sync_status/metadata columns.
    // These columns only exist in the YT DB after running yt_db_channels_migration.sql.
    // We only fetch what actually exists in Main DB, and treat sync state as fresh.
    console.log(`[YouTube Sync] Channel not found in YT DB. Fetching base info from Main DB...`);
    const { data: mainChannelData, error: mainFetchErr } = await supabase
      .from("youtube_channels")
      .select("channel_id, name")
      .eq("channel_id", channelId)
      .maybeSingle();
    
    if (mainFetchErr) throw mainFetchErr;
    // Treat as blank sync state since Main DB doesn't track sync progress
    channelData = mainChannelData ? { sync_cursor: null, sync_status: null, metadata: null } : null;
  }

  // Metadata tracks our multi-stage progress
  const metadata = (channelData?.metadata as any) || { stage: 'uploads', playlistIndex: 0 };
  const currentStage = isIncremental ? 'uploads' : metadata.stage || 'uploads';
  
  console.log(`[YouTube Sync] ${channelId} | Stage: ${currentStage} | Mode: ${isIncremental ? 'Incremental' : 'Full'}`);

  // --- SAFETY STEP: Ensure channel exists in the YouTube DB helper table ---
  let channelInfo = null;
  const { data: existingYtChannel } = await supabaseYt.from("youtube_channels").select("name, visibility, hide_shorts").eq("channel_id", channelId).maybeSingle();
  if (existingYtChannel) {
    channelInfo = existingYtChannel;
  } else {
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
  console.log(`[YouTube Sync] Pre-loading existing video IDs from DB for channel ${channelId}...`);
  const { data: existingData, error: selectErr } = await supabaseYt
    .from("yt_videos")
    .select("video_id")
    .eq("channel_id", channelId);
  
  if (selectErr) {
    console.error("[YouTube Sync] Failed to fetch existing video IDs:", selectErr);
  } else if (existingData) {
    existingData.forEach((v: any) => existingVideoIds.add(v.video_id));
    console.log(`[YouTube Sync] Pre-loaded ${existingVideoIds.size} existing video IDs.`);
  }

  try {
    // 2. Get "Uploads" playlist ID & Total reported videos
    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelUrl.searchParams.set("id", channelId);
    channelUrl.searchParams.set("part", "contentDetails,statistics");
    
    const { data: cData } = await fetchFromYouTubeWithFallback(channelUrl);
    const uploadsId = cData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    const totalReported = parseInt(cData.items?.[0]?.statistics?.videoCount || "0");

    if (!uploadsId) throw new Error("Uploads playlist not found");

    let totalSynced = 0;
    let pagesProcessed = 0;
    const maxPages = isIncremental ? 1 : (options.maxPages || 5);
    let hasMore = true;
    let nextCursor = options.startPageToken || (!isIncremental ? channelData?.sync_cursor : "") || "";

    // --- STAGE: UPLOADS ---
    if (currentStage === 'uploads') {
      try {
        do {
          const playlistUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
          playlistUrl.searchParams.set("playlistId", uploadsId);
          playlistUrl.searchParams.set("part", "snippet,contentDetails");
          playlistUrl.searchParams.set("maxResults", "50");
          if (nextCursor) playlistUrl.searchParams.set("pageToken", nextCursor);

          const { data } = await fetchFromYouTubeWithFallback(playlistUrl);

          const videos = (data.items || []).map((v: any) => ({
            video_id: v.contentDetails.videoId,
            channel_id: channelId,
            title: v.snippet.title,
            description: null,
            thumbnail_url: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url,
            published_at: v.contentDetails.videoPublishedAt || v.snippet.publishedAt,
            kind: 'video',
            is_short: isShortVideo(v.snippet.title, v.snippet.description),
            updated_at: new Date().toISOString()
          })).filter((v: any) => v.video_id && v.title !== "Private video" && v.title !== "Deleted video");

          const hasNewVideos = videos.some((v: any) => !existingVideoIds.has(v.video_id));

          if (videos.length > 0) totalSynced += await upsertVideosInChunks(videos, existingVideoIds);
          pagesProcessed++;
          nextCursor = data.nextPageToken || "";
          if (pagesProcessed >= maxPages) break;

          // Throttling: Add a delay to prevent exhausting Supabase Disk IO budget
          if (nextCursor) {
            const throttleTime = hasNewVideos ? 1000 : 100;
            await new Promise(resolve => setTimeout(resolve, throttleTime));
          }
        } while (nextCursor);

        hasMore = Boolean(nextCursor);
      } catch (upErr: any) {
        console.warn(`[YouTube Sync] Uploads playlist fetch failed (channel might have 0 public videos):`, upErr.message);
        hasMore = false;
      }
      
      // If uploads finished, move to Playlists stage
      if (!hasMore && !isIncremental) {
        metadata.stage = 'playlists';
        metadata.playlistIndex = 0;
        nextCursor = ""; // Reset cursor for first playlist
      }
    } 
    // --- STAGE: PLAYLISTS ---
    else if (currentStage === 'playlists') {
      const playlistsUrl = new URL("https://www.googleapis.com/youtube/v3/playlists");
      playlistsUrl.searchParams.set("channelId", channelId);
      playlistsUrl.searchParams.set("part", "id,snippet,contentDetails");
      playlistsUrl.searchParams.set("maxResults", "50");
      
      const { data: pData } = await fetchFromYouTubeWithFallback(playlistsUrl);
      const playlists = pData.items || [];
      const idx = metadata.playlistIndex || 0;

      // Save playlist records to database
      if (playlists.length > 0 && supabaseYt) {
        const playlistRecords = playlists.map((pl: any) => ({
          playlist_id: pl.id,
          channel_id: channelId,
          title: pl.snippet?.title,
          thumbnail_url: pl.snippet?.thumbnails?.high?.url || pl.snippet?.thumbnails?.medium?.url,
          video_count: pl.contentDetails?.itemCount || 0,
          updated_at: new Date().toISOString()
        }));
        await supabaseYt.from("yt_playlists").upsert(playlistRecords, { onConflict: "playlist_id" });
      }

      if (idx < playlists.length) {
        const pl = playlists[idx];
        console.log(`[Deep Sync] Scanning playlist ${idx + 1}/${playlists.length}: ${pl.snippet.title}`);
        
        let plFetchFailed = false;
        do {
          const itemsUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
          itemsUrl.searchParams.set("playlistId", pl.id);
          itemsUrl.searchParams.set("part", "snippet,contentDetails");
          itemsUrl.searchParams.set("maxResults", "50");
          if (nextCursor) itemsUrl.searchParams.set("pageToken", nextCursor);

          try {
            const { data } = await fetchFromYouTubeWithFallback(itemsUrl);

            const videos = (data.items || []).map((v: any) => ({
              video_id: v.contentDetails.videoId,
              channel_id: channelId,
              title: v.snippet.title,
              description: null,
              thumbnail_url: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || null,
              published_at: v.contentDetails.videoPublishedAt || v.snippet.publishedAt,
              kind: 'video', 
              is_short: isShortVideo(v.snippet.title, v.snippet.description),
              updated_at: new Date().toISOString()
            })).filter((v: any) => v.video_id && v.title !== "Private video" && v.title !== "Deleted video");

            const hasNewVideos = videos.some((v: any) => !existingVideoIds.has(v.video_id));

            // Fallback playlist thumbnail if it is missing or is the generic placeholder
            if (videos.length > 0 && !nextCursor) {
              const firstPublicVideo = videos.find((v: any) => v.title !== "Private video" && v.title !== "Deleted video" && v.thumbnail_url);
              if (firstPublicVideo && firstPublicVideo.thumbnail_url) {
                (async () => {
                  try {
                    const { data: plData } = await supabaseYt
                      .from("yt_playlists")
                      .select("thumbnail_url")
                      .eq("playlist_id", pl.id)
                      .maybeSingle();
                      
                    if (!plData || !plData.thumbnail_url || plData.thumbnail_url.includes("no_thumbnail.jpg")) {
                      await supabaseYt
                        .from("yt_playlists")
                        .update({ thumbnail_url: firstPublicVideo.thumbnail_url })
                        .eq("playlist_id", pl.id);
                      console.log(`[Sync] Updated playlist ${pl.id} cover thumbnail with first public video's thumbnail.`);
                    }
                  } catch (err) {
                    console.error("[Sync] Failed to update playlist thumbnail:", err);
                  }
                })();
              }
            }

            if (videos.length > 0) totalSynced += await upsertVideosInChunks(videos, existingVideoIds);
            pagesProcessed++;
            nextCursor = data.nextPageToken || "";
            if (pagesProcessed >= maxPages) break;

            // Throttling: Add a delay to prevent exhausting Supabase Disk IO budget
            if (nextCursor) {
              const throttleTime = hasNewVideos ? 1000 : 100;
              await new Promise(resolve => setTimeout(resolve, throttleTime));
            }
          } catch (plErr: any) {
            console.error(`[Sync] Failed to fetch playlistItems for playlist ${pl.id} ("${pl.snippet?.title}"):`, plErr.message);
            plFetchFailed = true;
            break;
          }
        } while (nextCursor);

        hasMore = true; // Always more until all playlists are done
        if (!nextCursor || plFetchFailed) {
          metadata.playlistIndex = idx + 1;
          if (metadata.playlistIndex >= playlists.length) hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    // 4. Update State
    const isActuallyDone = !hasMore || isIncremental;
    const updatePayload: any = {
      sync_cursor: isIncremental ? (channelData?.sync_cursor || null) : (hasMore ? nextCursor : null),
      metadata: metadata,
      sync_error: null
    };

    // Only mark as 'completed' and update timestamp if we aren't currently in a Deep Background Sync
    // This prevents a quick incremental sync from clearing the 'syncing' status of a deep scan.
    if (isActuallyDone && channelData?.sync_status !== 'syncing') {
      updatePayload.sync_status = 'completed';
      updatePayload.last_sync_at = new Date().toISOString();
    }

    await supabaseYt.from("youtube_channels").update(updatePayload).eq("channel_id", channelId);

    return { success: true, totalSynced, hasMore, nextPageToken: nextCursor, pagesProcessed };

  } catch (error: any) {
    console.error(`[Sync Error] ${channelId}:`, error);
    await supabaseYt.from("youtube_channels").update({ sync_status: 'error', sync_error: error.message }).eq("channel_id", channelId);
    throw error;
  }
}
