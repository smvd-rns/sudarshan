import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCached, CacheKeys } from "@/lib/cache";
import { getUserFromToken } from "@/lib/auth-utils";


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    // Local JWT decode — zero network call to Supabase Auth
    const authUser = getUserFromToken(request);
    let userId: string | null = null;
    let isSuperAdmin = false;

    if (authUser) {
      userId = authUser.id;
    }

    if (userId) {
      try {
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
          604800 // 7 days cache
        );
        isSuperAdmin = roleData.roles.includes(1);
      } catch (err) {
        console.warn("Failed to fetch user role (DB offline), assuming non-admin:", err);
        isSuperAdmin = false;
      }
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

    // Helper function to optimize custom logo URLs (specifically Google Drive ones)
    const optimizeLogoUrl = (url: string | null) => {
      if (!url) return null;
      if (url.includes("googleusercontent.com")) {
        if (!url.includes("=")) {
          return `${url}=s800`;
        } else {
          return url.replace(/=s\d+/, "=s800");
        }
      }
      return url;
    };

    const optimizedPublic = publicChannels.map((ch: any) => ({
      ...ch,
      custom_logo: optimizeLogoUrl(ch.custom_logo)
    }));

    if (!userId) {
      return NextResponse.json({ channels: optimizedPublic });
    }

    if (isSuperAdmin) {
      try {
        // Super Admin: also fetch private channels (not cached — admin view needs live data)
        const { data: allChannels, error } = await supabase
          .from("youtube_channels")
          .select("*")
          .eq("is_active", true)
          .order("order_index", { ascending: true });

        if (error) throw error;
        
        const optimizedAll = (allChannels || []).map((ch: any) => ({
          ...ch,
          custom_logo: optimizeLogoUrl(ch.custom_logo)
        }));
        return NextResponse.json({ channels: optimizedAll });
      } catch (err) {
        console.warn("Failed to fetch all channels for super admin (DB offline). Degrading to public channels.", err);
        // Fallthrough to return public channels below
      }
    }

    // --- Cache: user's private channel assignments (1hr TTL, stale-on-error) ---
    let assignmentData: string[] = [];
    try {
      assignmentData = await getCached(
        CacheKeys.userAssignments(userId),
        async () => {
          const { data: assignedIds } = await supabase
            .from("youtube_channel_assignments")
            .select("channel_id")
            .eq("user_id", userId!);
          return (assignedIds || []).map((a: any) => a.channel_id);
        },
        604800 // 7 days cache
      );
    } catch (err) {
      console.warn("Failed to fetch private channel assignments (DB offline):", err);
      // Fallback to empty array so public channels still load
      assignmentData = [];
    }

    if (assignmentData.length > 0) {
      // Fetch private channels assigned to this user (small targeted query, not cached)
      const { data: privateChannels } = await supabase
        .from("youtube_channels")
        .select("*")
        .eq("is_active", true)
        .eq("visibility", "private")
        .in("id", assignmentData)
        .order("order_index", { ascending: true });

      const combined = [...optimizedPublic, ...(privateChannels || []).map((ch: any) => ({
        ...ch,
        custom_logo: optimizeLogoUrl(ch.custom_logo)
      }))];
      combined.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
      return NextResponse.json({ channels: combined });
    }

    return NextResponse.json({ channels: optimizedPublic });


  } catch (error) {
    console.error("Channels API error:", error);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}
