import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";
import { syncYouTubeChannelFull } from "@/lib/youtube-sync-full";

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

const RENDER_SYNC_URL = process.env.RENDER_SYNC_URL;
const runningJobs = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { channelId } = await request.json();
    if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });

    // If a Render URL is provided, offload the heavy sync to Render
    if (RENDER_SYNC_URL) {
      const authHeader = request.headers.get("Authorization");
      console.log(`[Sync Proxy] Forwarding sync request for ${channelId} to Render: ${RENDER_SYNC_URL}`);
      
      // Ping the Render URL to ensure it wakes up
      fetch(`${RENDER_SYNC_URL}/api/health`).catch(() => {});
      
      try {
        const renderRes = await fetch(`${RENDER_SYNC_URL}/api/admin/youtube/background-sync`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": authHeader || ""
          },
          body: JSON.stringify({ channelId }),
          // Allow up to 60s for Render free-tier wake up
          signal: AbortSignal.timeout(60000)
        });
        const data = await renderRes.json();
        return NextResponse.json(data, { status: renderRes.status });
      } catch (proxyError: any) {
        console.error("[Sync Proxy] Render server failed:", proxyError.message);
        const isTimeout = proxyError.name === 'TimeoutError' || proxyError.message.includes('timeout');
        return NextResponse.json({ 
          error: isTimeout 
            ? "Render server is waking up. Please wait 30 seconds and try clicking the button again." 
            : "Render server unreachable: " + proxyError.message 
        }, { status: 502 });
      }
    }

    // LOCAL FALLBACK (Runs on Vercel - Subject to timeouts)
    if (runningJobs.has(channelId)) {
      return NextResponse.json({ status: "already_running", channelId });
    }

    runningJobs.add(channelId);
    syncYouTubeChannelFull(channelId).finally(() => {
      runningJobs.delete(channelId);
    });

    return NextResponse.json({ 
      status: "started", 
      channelId,
      message: "Background sync started LOCALLY. Note: Vercel may timeout this job."
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const channelId = request.nextUrl.searchParams.get("channelId");

    if (RENDER_SYNC_URL) {
      const authHeader = request.headers.get("Authorization");
      try {
        const renderRes = await fetch(`${RENDER_SYNC_URL}/api/admin/youtube/background-sync${channelId ? `?channelId=${channelId}` : ""}`, {
          headers: { "Authorization": authHeader || "" }
        });
        const data = await renderRes.json();
        return NextResponse.json(data);
      } catch (err) {
        return NextResponse.json({ running: false, error: "Could not reach Render server" });
      }
    }

    return NextResponse.json({ 
      running: channelId ? runningJobs.has(channelId) : false,
      allRunning: Array.from(runningJobs)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
