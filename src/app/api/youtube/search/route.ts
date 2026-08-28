import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase"; // Main DB for auth
import { supabaseYt } from "@/lib/supabase-yt"; // YouTube DB for search
import { getUserFromToken } from "@/lib/auth-utils";


export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const channelId = searchParams.get("channelId");
  const limit = parseInt(searchParams.get("limit") || "200");

  if (!query) {
    return NextResponse.json({ items: [] });
  }

  try {
    console.log(`[Search API] Querying: "${query}" (Channel Filters: ${channelId || "all"})`);
    
    // --- Privacy Filtering Logic (Cross-DB) ---
    // 1. Get User ID and Role from local JWT (zero network call)
    const authUser = getUserFromToken(request);
    let userId: string | null = null;
    let isAdmin = false;
    
    if (authUser) {
      userId = authUser.id;
      // Fetch profile for role check
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
    // 2. Determine allowed channel IDs
    // If channelId param was explicitly provided (e.g., user is inside a channel or has filters active),
    // trust it directly — it means the frontend already verified those channels are visible to the user.
    const requestedChannelIds = channelId ? channelId.split(',').filter(Boolean) : null;

    let finalChannelIds: string[] | null = requestedChannelIds;

    if (isAdmin) {
      // Admins: if no filter given, search ALL active channels
      if (!finalChannelIds) {
        const { data: allActiveChannels } = await supabase
          .from('youtube_channels')
          .select('channel_id')
          .eq('is_active', true);
        
        finalChannelIds = (allActiveChannels || []).map(c => c.channel_id);
        console.log(`[Search API] Admin searching ALL ${finalChannelIds.length} channels.`);
      }
    } else if (!finalChannelIds) {
      // Normal user with NO explicit channel filter: restrict to accessible channels only
      const { data: allowedChannels, error: rpcError } = await supabase.rpc('get_user_accessible_channels', { 
        requesting_user_id: userId 
      });
      
      if (rpcError) {
        console.error("[Search API] RPC Error fetching accessible channels:", rpcError);
        // On RPC failure, fall back to null (SQL fn will enforce visibility = 'public')
        finalChannelIds = null;
      } else {
        const accessibleIds = (allowedChannels || []).map((c: any) => c.channel_id);
        finalChannelIds = accessibleIds.length > 0 ? accessibleIds : null;
      }
    }
    // If explicit channelIds were passed (requestedChannelIds != null), we skip the RPC
    // entirely — the SQL fn still enforces visibility = 'public' as a safety net.

    // Convert empty array to null so SQL fn searches all rather than returning nothing
    if (finalChannelIds && finalChannelIds.length === 0) {
      finalChannelIds = null;
    }

    // 3. Search in YouTube DB
    const { data, error: searchError } = await supabaseYt.rpc("search_youtube_content", {
      query_text: query,
      channel_ids: finalChannelIds, 
      max_limit: limit
    });

    if (searchError) {
      console.error("[Search API] RPC Error:", searchError);
      throw searchError;
    }

    console.log(`[Search API] Results found: ${data?.length || 0}`);

    const results = data || [];
    const playlists = results
      .filter((item: any) => item.type === 'playlist')
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        thumbnail: item.thumbnail,
        published: item.published,
        type: item.type,
        playlistCount: item.playlist_count,
        channelTitle: item.channel_title,
        channelId: item.channel_id
      }));

    const videos = results
      .filter((item: any) => item.type === 'video' || item.type === 'playlistItem')
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        thumbnail: item.thumbnail,
        published: item.published,
        type: item.type,
        channelTitle: item.channel_title,
        channelId: item.channel_id
      }));

    return NextResponse.json({ 
      playlists,
      videos,
      count: results.length 
    });

  } catch (error: any) {
    console.error("Search Error:", error);
    return NextResponse.json({ error: "Internal Search Error" }, { status: 500 });
  }
}
