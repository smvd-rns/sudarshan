import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCached, CacheKeys } from "@/lib/cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    // --- Auth: verify token (hits Supabase Auth, not our public DB) ---
    const authHeader = request.headers.get("Authorization");
    let userId: string | null = null;
    let isSuperAdmin = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;

        // --- Cache: user role (1hr TTL, stale-on-error) ---
        const roleData = await getCached(
          CacheKeys.userRole(userId),
          async () => {
            const { data: profile } = await supabase
              .from("profiles")
              .select("role, roles")
              .eq("id", userId!)
              .single();
            const roles = (Array.isArray(profile?.roles) ? profile.roles : [profile?.role])
              .filter((r: any) => r !== null && r !== undefined)
              .map(Number);
            return { roles };
          },
          3600 // 1 hour
        );

        isSuperAdmin = roleData.roles.includes(1);
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --- Cache: public channel list (24hr TTL, stale-on-error) ---
    const publicChannels = await getCached(
      CacheKeys.channelsPublic,
      async () => {
        const { data, error } = await supabase
          .from("youtube_channels")
          .select("*")
          .eq("is_active", true)
          .eq("visibility", "public")
          .order("order_index", { ascending: true });
        if (error) throw error;
        return data || [];
      },
      86400 // 24 hours
    );

    if (isSuperAdmin) {
      // Super Admin: also fetch private channels (not cached — admin view needs live data)
      const { data: allChannels, error } = await supabase
        .from("youtube_channels")
        .select("*")
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (error) throw error;
      return NextResponse.json({ channels: allChannels || [] });
    }

    // --- Cache: user's private channel assignments (1hr TTL, stale-on-error) ---
    const assignmentData = await getCached(
      CacheKeys.userAssignments(userId),
      async () => {
        const { data: assignedIds } = await supabase
          .from("youtube_channel_assignments")
          .select("channel_id")
          .eq("user_id", userId!);
        return (assignedIds || []).map((a: any) => a.channel_id);
      },
      3600 // 1 hour
    );

    if (assignmentData.length > 0) {
      // Fetch private channels assigned to this user (small targeted query, not cached)
      const { data: privateChannels } = await supabase
        .from("youtube_channels")
        .select("*")
        .eq("is_active", true)
        .eq("visibility", "private")
        .in("id", assignmentData)
        .order("order_index", { ascending: true });

      const combined = [...publicChannels, ...(privateChannels || [])];
      combined.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
      return NextResponse.json({ channels: combined });
    }

    return NextResponse.json({ channels: publicChannels });

  } catch (error) {
    console.error("Channels API error:", error);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}
