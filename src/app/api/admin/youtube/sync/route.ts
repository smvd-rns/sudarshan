import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";
import { syncYouTubeChannel } from "@/lib/youtube-sync";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyAdminOrManager(req: NextRequest) {
  // Local JWT decode - zero network
  const user = getUserFromToken(req);
  if (!user) return null;

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

function isStatementTimeoutError(error: any) {
  return error?.code === "57014" || String(error?.message || "").toLowerCase().includes("statement timeout");
}

export async function POST(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { channelId, isIncremental = false, cursor, maxPages } = await request.json();

    if (!channelId) {
      return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
    }

    try {
      const { totalSynced, hasMore, nextPageToken, pagesProcessed } = await syncYouTubeChannel(channelId, isIncremental, {
        startPageToken: typeof cursor === "string" ? cursor : undefined,
        maxPages: typeof maxPages === "number" ? maxPages : undefined
      });
      return NextResponse.json({
        success: true,
        totalSynced,
        mode: isIncremental ? "incremental" : "full",
        hasMore,
        nextCursor: nextPageToken || null,
        pagesProcessed
      });
    } catch (error: any) {
      // Full sync can exceed DB statement timeout on large channels.
      if (!isIncremental && isStatementTimeoutError(error)) {
        // Cursor-based backfill should retry on the same cursor, not fall back
        // to incremental (which only touches latest videos).
        if (cursor || typeof maxPages === "number") {
          return NextResponse.json({
            success: false,
            retryable: true,
            cursor: cursor || null,
            error: "Backfill page timed out. Retry from the same cursor."
          }, { status: 504 });
        }

        console.warn(`[Manual Sync] Full sync timed out for ${channelId}. Retrying incremental sync.`);
        const { totalSynced } = await syncYouTubeChannel(channelId, true);
        return NextResponse.json({
          success: false,
          totalSynced,
          mode: "incremental",
          fallback: "full_sync_timed_out",
          error: "Full sync timed out. Incremental sync completed only. Trigger full sync again to continue backfill."
        }, { status: 408 });
      }
      throw error;
    }

  } catch (error: any) {
    console.error("Manual Sync Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
