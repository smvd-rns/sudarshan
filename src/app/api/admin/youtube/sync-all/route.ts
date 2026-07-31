import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncYouTubeChannel } from "@/lib/youtube-sync";
import { supabaseYt } from "@/lib/supabase-yt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// This is the endpoint called by Vercel Cron
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  // Security check: Verify the Cron Secret
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[Sync All] Unauthorized attempt from header:", authHeader);
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 1. Fetch all active channels
    const { data: channels, error: fetchError } = await supabase
      .from("youtube_channels")
      .select("channel_id, name, sync_status")
      .eq("is_active", true);

    if (fetchError) throw fetchError;

    // Overlay real-time sync status from YouTube DB
    if (supabaseYt && channels && channels.length > 0) {
      const { data: ytChannels } = await supabaseYt
        .from("youtube_channels")
        .select("channel_id, sync_status");
      
      if (ytChannels) {
        const ytStatusMap = new Map(ytChannels.map(c => [c.channel_id, c.sync_status]));
        channels.forEach((mc: any) => {
          const ytStatus = ytStatusMap.get(mc.channel_id);
          if (ytStatus) {
            mc.sync_status = ytStatus;
          }
        });
      }
    }

    console.log(`[Sync All] Starting automated sync for ${channels?.length || 0} channels`);
    const results = [];

    // 2. Perform syncs SEQUENTIALLY to avoid statement timeouts on large tables
    for (const channel of (channels || [])) {
      // Skip if a deep background sync is already in progress
      if (channel.sync_status === 'syncing') {
        console.log(`[Sync All] SKIP: ${channel.name} (Deep Background Sync in progress)`);
        results.push({ channel: channel.name, success: true, skipped: true, reason: "Deep Sync Active" });
        continue;
      }

      try {
        const result = await syncYouTubeChannel(channel.channel_id, true);
        console.log(`[Sync All] SUCCESS: ${channel.name} (${result.totalSynced} videos)`);
        results.push({ channel: channel.name, success: true, videos: result.totalSynced });
      } catch (err: any) {
        console.error(`[Sync All] FAILED: ${channel.name} - ${err.message}`);
        results.push({ channel: channel.name, success: false, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      channelsCount: channels?.length || 0,
      results: results
    });

  } catch (error: any) {
    console.error("[Sync All Global Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
