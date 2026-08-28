import { NextRequest, NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { getCached, invalidateCache, CacheKeys } from "@/lib/cache";
import { getUserFromToken } from "@/lib/auth-utils";


/**
 * GET: Fetch user's favorite channel IDs
 */
export async function GET(request: NextRequest) {
  try {
    // Local JWT decode — zero network
    const user = getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // GET: Serve favourite channels from Redis cache (1hr TTL, stale-on-error)
    const favoriteIds = await getCached(
      CacheKeys.favChannels(user.id),
      async () => {
        const { data: favoriteRecords, error: favError } = await supabaseAdmin!
          .from("user_favorite_channels")
          .select("channel_id")
          .eq("user_id", user.id);

        if (favError) {
          if (favError.code === "PGRST116" || favError.message?.includes("does not exist")) {
            return [];
          }
          throw favError;
        }
        return (favoriteRecords || []).map((f: any) => f.channel_id);
      },
      3600 // 1 hour
    );

    return NextResponse.json({ favoriteIds });
  } catch (error: any) {
    console.error("Fetch favorite channels API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Add or Remove favorite channel
 */
export async function POST(request: NextRequest) {
  try {
    // Local JWT decode — zero network
    const user = getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { channel_id, intent } = await request.json();
    if (!channel_id) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    // Check if already favorited
    const { data: existing } = await supabaseAdmin!
      .from("user_favorite_channels")
      .select("id")
      .eq("user_id", user.id)
      .eq("channel_id", channel_id)
      .maybeSingle();

    if (existing) {
      if (intent === "remove") {
        const { error: delError } = await supabaseAdmin!
          .from("user_favorite_channels")
          .delete()
          .eq("id", existing.id);
        
        if (delError) {
          if (delError.code === "57014" || String(delError.message).includes("timeout")) {
            return NextResponse.json({ error: "Unable to save right now. Please try again in a few minutes." }, { status: 503 });
          }
          throw delError;
        }
        await invalidateCache(CacheKeys.favChannels(user.id));
        return NextResponse.json({ action: "removed", channel_id });
      }
      // Already existing, no need to do anything else
      return NextResponse.json({ action: "exists", channel_id });
      
    } else {
      if (intent === "remove") {
        return NextResponse.json({ action: "ignored", channel_id });
      }

      // Add New
      const { error: insError } = await supabaseAdmin!
        .from("user_favorite_channels")
        .insert({
          user_id: user.id,
          channel_id: channel_id
        });
      
      if (insError) {
        if (insError.code === "57014" || String(insError.message).includes("timeout")) {
          return NextResponse.json({ error: "Unable to save right now. Please try again in a few minutes." }, { status: 503 });
        }
        throw insError;
      }
      await invalidateCache(CacheKeys.favChannels(user.id));
      return NextResponse.json({ action: "added", channel_id });
    }
  } catch (error: any) {
    console.error("Favorite channel update API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
