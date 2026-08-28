import { NextRequest, NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { supabaseIdktAdmin } from "@/lib/supabaseIdkt";
import { getUserFromToken } from "@/lib/auth-utils";


/**
 * GET: Fetch user's "Hear Later" audio tracks with progress
 */
export async function GET(request: NextRequest) {
  try {
    // Local JWT decode — zero network
    const user = getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch from Main Project (User Favorites + Progress)
    const { data: favorites, error: favError } = await supabaseAdmin!
      .from("user_audio_favorites")
      .select("audio_id, last_position, duration")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (favError) throw favError;

    const favoriteIds = favorites.map(f => f.audio_id);
    const progressMap = new Map(favorites.map(f => [f.audio_id, { 
      last_position: f.last_position, 
      duration: f.duration 
    }]));

    if (favoriteIds.length === 0) {
      return NextResponse.json({ items: [], favoriteIds: [] });
    }

    // 2. Fetch Metadata from IDKT Project
    const { data: audioItems, error: idktError } = await supabaseIdktAdmin!
      .from("idkt_items")
      .select("*")
      .in("id", favoriteIds);

    if (idktError) throw idktError;

    // 3. Merge
    const audioMap = new Map(audioItems.map(item => {
      const progress = progressMap.get(item.id);
      return [item.id, {
        ...item,
        lastPosition: progress?.last_position || 0,
        duration: progress?.duration || 0
      }];
    }));

    // Maintain creation order
    const sortedItems = favoriteIds.map(id => audioMap.get(id)).filter(Boolean);

    return NextResponse.json({ items: sortedItems, favoriteIds });
  } catch (error: any) {
    console.error("Fetch audio Hear Later error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Toggle status or Update progress manually
 */
export async function POST(request: NextRequest) {
  try {
    // Local JWT decode — zero network
    const user = getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { audio_id, last_position, duration, is_update_only } = await request.json();
    console.log("[AUDIO_FAV] POST:", { audio_id, last_position, is_update_only, userId: user.id });

    if (!audio_id) {
      return NextResponse.json({ error: "audio_id is required" }, { status: 400 });
    }

    if (!supabaseAdmin) {
      console.error("[AUDIO_FAV] supabaseAdmin is not initialized!");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Check if already in Hear Later
    const { data: existing, error: checkError } = await supabaseAdmin
      .from("user_audio_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("audio_id", audio_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error("[AUDIO_FAV] Check error:", checkError);
    }

    if (existing) {
      console.log("[AUDIO_FAV] Existing found, updating/deleting");
      if (last_position !== undefined) {
        // Manual Progress Update
        const { error: updError } = await supabaseAdmin
          .from("user_audio_favorites")
          .update({
            last_position: last_position,
            duration: duration || 0,
            last_saved_at: new Date().toISOString()
          })
          .eq("id", existing.id);
        
        if (updError) throw updError;
        return NextResponse.json({ action: "updated", audio_id, last_position });
      } else if (!is_update_only) {
        // Remove
        const { error: delError } = await supabaseAdmin
          .from("user_audio_favorites")
          .delete()
          .eq("id", existing.id);
        
        if (delError) throw delError;
        return NextResponse.json({ action: "removed", audio_id });
      }
      return NextResponse.json({ action: "none", audio_id });
    } else {
      console.log("[AUDIO_FAV] No existing found, adding");
      if (is_update_only) {
        console.log("[AUDIO_FAV] is_update_only=true, ignoring add");
        return NextResponse.json({ action: "ignored", audio_id });
      }
      // Add
      const { error: insError } = await supabaseAdmin
        .from("user_audio_favorites")
        .insert({
          user_id: user.id,
          audio_id: audio_id,
          last_position: last_position || 0,
          duration: duration || 0
        });
      
      if (insError) throw insError;
      return NextResponse.json({ action: "added", audio_id });
    }
  } catch (error: any) {
    console.error("[AUDIO_FAV] API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
