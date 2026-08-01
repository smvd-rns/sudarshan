import { NextRequest, NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { supabaseYtAdmin } from "@/lib/supabase-yt";
import { getCached, invalidateCache, CacheKeys } from "@/lib/cache";


/**
 * GET: Fetch user's favorite videos
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    
    // VERIFY with a much longer timeout because the Main DB is extremely busy
    const { data: { user }, error: authError } = await Promise.race([
      supabase.auth.getUser(token),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Supabase Connection Timeout")), 60000))
    ]).catch(err => ({ data: { user: null }, error: err }));
    
    if (authError || !user) {
      console.error("Auth Error/Timeout:", authError);
      return NextResponse.json({ 
        error: authError?.message === "Supabase Connection Timeout" 
          ? "Database connection timed out (60s). The Main DB is extremely busy. Your request might still be processing in the background." 
          : "Invalid session" 
      }, { status: authError?.message === "Supabase Connection Timeout" ? 504 : 401 });
    }

    // GET: Serve Watch Later list from Redis cache (30min TTL, stale-on-error)
    const favoriteData = await getCached(
      CacheKeys.watchLater(user.id),
      async () => {
        const { data: favorites, error: favError } = await supabaseAdmin!
          .from("user_favorites")
          .select("video_id, last_position, duration")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (favError) throw favError;
        return favorites;
      },
      1800 // 30 minutes
    );

    const favoriteIds = favoriteData.map((f: any) => f.video_id);
    const progressMap = new Map(favoriteData.map((f: any) => [f.video_id, {
      last_position: f.last_position,
      duration: f.duration
    }]));

    // Fetch metadata from yt_videos in the dedicated YouTube DB
    const { data: videos, error: vidError } = await supabaseYtAdmin!
      .from("yt_videos")
      .select("*")
      .in("video_id", favoriteIds);

    if (vidError) throw vidError;

    // Map database results to the VideoItem shape expected by the frontend
    const videoMap = new Map(videos.map((v: any) => {
      const progress = progressMap.get(v.video_id);
      return [v.video_id, {
        id: v.video_id,
        title: v.title,
        thumbnail: v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`,
        date: v.published_at ? new Date(v.published_at).toLocaleDateString() : "",
        published: v.published_at || v.created_at,
        type: v.kind || "video",
        channelId: v.channel_id,
        lastPosition: progress?.last_position || 0,
        duration: progress?.duration || 0
      }];
    }));

    // Sort to match the order of favorites (most recent first)
    const sortedVideos = favoriteIds.map((id: string) => videoMap.get(id)).filter(Boolean);

    return NextResponse.json({ items: sortedVideos, favoriteIds });
  } catch (error: any) {
    console.error("Fetch Watch Later error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Toggle Watch Later status or update progress
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    
    // Use the same 60s timeout for POST to handle extreme DB slowness
    const { data: { user }, error: authError } = await Promise.race([
      supabase.auth.getUser(token),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Supabase Connection Timeout")), 60000))
    ]).catch(err => ({ data: { user: null }, error: err }));
    
    if (authError || !user) {
      return NextResponse.json({ 
        error: authError?.message === "Supabase Connection Timeout" 
          ? "Connection timeout (60s). The DB is extremely busy, but your progress might still be processing. Check back in a minute." 
          : "Invalid session" 
      }, { status: authError?.message === "Supabase Connection Timeout" ? 504 : 401 });
    }

    const { video_id, last_position, duration, is_update_only, intent } = await request.json();
    if (!video_id) {
      return NextResponse.json({ error: "video_id is required" }, { status: 400 });
    }
    const parsedLastPosition = last_position !== undefined ? Number(last_position) : undefined;
    const parsedDuration = duration !== undefined ? Number(duration) : undefined;
    
    const validLastPosition = (parsedLastPosition !== undefined && Number.isFinite(parsedLastPosition)) ? parsedLastPosition : undefined;
    const validDuration = (parsedDuration !== undefined && Number.isFinite(parsedDuration)) ? parsedDuration : undefined;

    // Check if already in Watch Later
    const { data: existing } = await supabaseAdmin!
      .from("user_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("video_id", video_id)
      .single();

    if (existing) {
      if (intent === "remove") {
        const { error: delError } = await supabaseAdmin!
          .from("user_favorites")
          .delete()
          .eq("id", existing.id);
        
        if (delError) {
          if (delError.code === "57014" || String(delError.message).includes("timeout")) {
            return NextResponse.json({ error: "Unable to save right now. Please try again in a few minutes." }, { status: 503 });
          }
          throw delError;
        }
        await invalidateCache(CacheKeys.watchLater(user.id));
        return NextResponse.json({ action: "removed", video_id });
      }
      
      // Update existing record
      const updateData: any = {
        last_watched_at: new Date().toISOString()
      };
      if (validLastPosition !== undefined) updateData.last_position = validLastPosition;
      if (validDuration !== undefined) updateData.duration = validDuration;

      const { error: updError } = await supabaseAdmin!
        .from("user_favorites")
        .update(updateData)
        .eq("id", existing.id);
      
      if (updError) {
        if (updError.code === "57014" || String(updError.message).includes("timeout")) {
          return NextResponse.json({ error: "Unable to save right now. Please try again in a few minutes." }, { status: 503 });
        }
        throw updError;
      }
      await invalidateCache(CacheKeys.watchLater(user.id));
      return NextResponse.json({ action: "updated", video_id, last_position: validLastPosition ?? null });
      
    } else {
      if (intent === "remove" || intent === "progress" || is_update_only) {
        return NextResponse.json({ action: "ignored", video_id });
      }

      // Add New
      const { error: insError } = await supabaseAdmin!
        .from("user_favorites")
        .insert({
          user_id: user.id,
          video_id: video_id,
          last_position: validLastPosition ?? 0,
          duration: validDuration ?? 0,
          last_watched_at: new Date().toISOString()
        });
      
      if (insError) {
        if (insError.code === "57014" || String(insError.message).includes("timeout")) {
          return NextResponse.json({ error: "Unable to save right now. Please try again in a few minutes." }, { status: 503 });
        }
        throw insError;
      }
      await invalidateCache(CacheKeys.watchLater(user.id));
      return NextResponse.json({ action: "added", video_id });
    }
  } catch (error: any) {
    console.error("Watch Later update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
