import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";
import { invalidateCache, CacheKeys } from "@/lib/cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyAdminOrManager(req: NextRequest) {
  // Local JWT decode — zero network call to Supabase Auth
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

// GET: Fetch assignments for a specific channel
export async function GET(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");

    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("youtube_channel_assignments")
      .select("*, profiles(full_name, email)")
      .eq("channel_id", channelId);

    if (error) throw error;
    return NextResponse.json({ assignments: data || [] });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

// POST: Add an assignment (supports single or bulk)
export async function POST(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { channel_id, user_id, user_ids } = body;

    if (user_ids && Array.isArray(user_ids)) {
      const assignments = user_ids.map(uid => ({ channel_id, user_id: uid }));
      const { data, error } = await supabase
        .from("youtube_channel_assignments")
        .upsert(assignments, { onConflict: 'channel_id,user_id' })
        .select();
      if (error) throw error;
      // Invalidate assignment cache for all affected users
      await Promise.all(user_ids.map((uid: string) => invalidateCache(CacheKeys.userAssignments(uid))));
      return NextResponse.json({ data });
    } else {
      const { data, error } = await supabase
        .from("youtube_channel_assignments")
        .upsert([{ channel_id, user_id }], { onConflict: 'channel_id,user_id' })
        .select();
      if (error) throw error;
      // Invalidate assignment cache for this user
      if (user_id) await invalidateCache(CacheKeys.userAssignments(user_id));
      return NextResponse.json({ data });
    }
  } catch (err) {
    return NextResponse.json({ error: "Failed to assign users" }, { status: 500 });
  }
}

// DELETE: Remove an assignment
export async function DELETE(request: NextRequest) {
  try {
    const isAuthorized = await verifyAdminOrManager(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    // Fetch the assignment to know which user's cache to invalidate
    const { data: existing } = await supabase
      .from("youtube_channel_assignments")
      .select("user_id")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("youtube_channel_assignments")
      .delete()
      .eq("id", id);

    if (error) throw error;

    // Invalidate this user's assignment cache so they lose access immediately
    if (existing?.user_id) await invalidateCache(CacheKeys.userAssignments(existing.user_id));

    return NextResponse.json({ message: "Assignment removed" });
  } catch (err) {
    return NextResponse.json({ error: "Failed to remove assignment" }, { status: 500 });
  }
}
