import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";
import { invalidateCache, CacheKeys } from "@/lib/cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyAdminOrManager(req: NextRequest) {
  const user = getUserFromToken(req);
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, roles")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const roles = Array.isArray(profile.roles) ? profile.roles : [profile.role].filter(r => r != null);
  const isAuthorized = roles.includes(1) || roles.includes(5);
  
  return isAuthorized ? user.id : null;
}

export async function POST(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const force = !!body.force; // If true, force re-conversion even if already base64

    const { data: channels, error } = await supabase
      .from("youtube_channels")
      .select("id, channel_id, name, custom_logo")
      .order("order_index", { ascending: true });

    if (error) throw error;
    if (!channels || channels.length === 0) {
      return NextResponse.json({ success: true, message: "No channels found.", convertedCount: 0 });
    }

    let convertedCount = 0;
    let alreadyConvertedCount = 0;
    let failedCount = 0;
    const details: any[] = [];

    for (const channel of channels) {
      const logoUrl = channel.custom_logo ? String(channel.custom_logo).trim() : "";

      if (!logoUrl) {
        details.push({ id: channel.id, name: channel.name, status: "skipped_no_logo" });
        continue;
      }

      if (logoUrl.startsWith("data:image/") && !force) {
        alreadyConvertedCount++;
        details.push({ id: channel.id, name: channel.name, status: "already_base64" });
        continue;
      }

      try {
        // Handle Google Drive file link normalization if needed
        let fetchUrl = logoUrl;
        const driveMatch = fetchUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
          fetchUrl = `https://lh3.googleusercontent.com/d/${driveMatch[1]}=s800`;
        }

        const imgRes = await fetch(fetchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });

        if (!imgRes.ok) {
          failedCount++;
          details.push({ id: channel.id, name: channel.name, status: "fetch_failed", code: imgRes.status });
          continue;
        }

        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        let contentType = imgRes.headers.get("content-type") || "image/jpeg";
        if (contentType.includes(";")) {
          contentType = contentType.split(";")[0].trim();
        }

        const base64Str = `data:${contentType};base64,${buffer.toString("base64")}`;

        // Save to Supabase
        const { error: updateErr } = await supabase
          .from("youtube_channels")
          .update({ custom_logo: base64Str })
          .eq("id", channel.id);

        if (updateErr) {
          failedCount++;
          details.push({ id: channel.id, name: channel.name, status: "db_update_failed", error: updateErr.message });
        } else {
          convertedCount++;
          details.push({ id: channel.id, name: channel.name, status: "converted_success" });
        }
      } catch (e: any) {
        failedCount++;
        details.push({ id: channel.id, name: channel.name, status: "error", error: e.message || String(e) });
      }
    }

    // Invalidate public channel cache so instant base64 channels deliver immediately
    await invalidateCache(CacheKeys.channelsPublic);

    return NextResponse.json({
      success: true,
      processedCount: channels.length,
      convertedCount,
      alreadyConvertedCount,
      failedCount,
      details
    });

  } catch (err: any) {
    console.error("[ConvertBase64Logos] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to convert logos" }, { status: 500 });
  }
}
