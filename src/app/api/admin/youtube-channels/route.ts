import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseYtAdmin } from "@/lib/supabase-yt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to sync to the YouTube DB
async function syncToYtDb(channelId: string, name: string, visibility: string, hideShorts = false, isDelete = false) {
  if (!supabaseYtAdmin) return;
  
  if (isDelete) {
    await supabaseYtAdmin.from("youtube_channels").delete().eq("channel_id", channelId);
  } else {
    await supabaseYtAdmin.from("youtube_channels").upsert({
      channel_id: channelId,
      name,
      visibility,
      hide_shorts: hideShorts
    }, { onConflict: 'channel_id' });
  }
}

async function verifyAdminOrManager(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  
  const token = authHeader.split(" ")[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, roles")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const roles = Array.isArray(profile.roles) ? profile.roles : [profile.role].filter(r => r != null);
  // Allow Super Admin (1) or Manager (5)
  const isAuthorized = roles.includes(1) || roles.includes(5);
  
  return isAuthorized ? user.id : null;
}

// GET: Fetch all channels for management
export async function GET(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: mainChannels, error } = await supabase
      .from("youtube_channels")
      .select("*")
      .order("order_index", { ascending: true });

    if (error) throw error;

    // Overlay real-time sync status from YouTube DB
    if (supabaseYtAdmin && mainChannels && mainChannels.length > 0) {
      const { data: ytChannels } = await supabaseYtAdmin
        .from("youtube_channels")
        .select("channel_id, sync_status, last_sync_at, sync_error, metadata");
      
      if (ytChannels) {
        const ytStatusMap = new Map(ytChannels.map(c => [c.channel_id, c]));
        mainChannels.forEach((mc: any) => {
          const ytInfo = ytStatusMap.get(mc.channel_id);
          if (ytInfo) {
            mc.sync_status = ytInfo.sync_status;
            mc.last_sync_at = ytInfo.last_sync_at;
            mc.sync_error = ytInfo.sync_error;
            mc.metadata = ytInfo.metadata;
          }
        });
      }
    }

    return NextResponse.json({ channels: mainChannels || [] });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST: Add new channel
export async function POST(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const payload = { ...body, visibility: body.visibility || 'public' };
    
    // 1. Insert into Main DB
    const { data, error } = await supabase
      .from("youtube_channels")
      .insert([payload])
      .select();

    if (error) throw error;

    // 2. Sync to YouTube DB
    if (data?.[0]) {
      await syncToYtDb(data[0].channel_id, data[0].name, data[0].visibility, data[0].hide_shorts);
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("Insert error:", err);
    return NextResponse.json({ error: "Failed to insert" }, { status: 500 });
  }
}

// PUT: Update channel
export async function PUT(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    // 1. Update Main DB
    const { data, error } = await supabase
      .from("youtube_channels")
      .update(updates)
      .eq("id", id)
      .select();

    if (error) throw error;

    // 2. Sync to YouTube DB and propagate status updates if present
    if (data?.[0]) {
      const ytUpdates: any = {
        channel_id: data[0].channel_id,
        name: data[0].name,
        visibility: data[0].visibility,
        hide_shorts: data[0].hide_shorts
      };
      
      if ('sync_status' in updates) ytUpdates.sync_status = updates.sync_status;
      if ('metadata' in updates) ytUpdates.metadata = updates.metadata;
      if ('sync_error' in updates) ytUpdates.sync_error = updates.sync_error;
      if ('sync_cursor' in updates) ytUpdates.sync_cursor = updates.sync_cursor;

      if (supabaseYtAdmin) {
        await supabaseYtAdmin.from("youtube_channels").upsert(ytUpdates, { onConflict: 'channel_id' });
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("Update error:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// DELETE: Remove channel
export async function DELETE(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    // Get channel_id before deleting
    const { data: channel } = await supabase.from("youtube_channels").select("channel_id").eq("id", id).single();

    // 1. Delete from Main DB
    const { error } = await supabase
      .from("youtube_channels")
      .delete()
      .eq("id", id);

    if (error) throw error;

    // 2. Delete from YouTube DB
    if (channel?.channel_id) {
      await syncToYtDb(channel.channel_id, "", "", false, true);
    }

    return NextResponse.json({ message: "Deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
