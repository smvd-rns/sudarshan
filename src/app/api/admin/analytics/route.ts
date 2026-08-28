import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";
import { redis } from "@/lib/redis";

// Note: Use Service Role Key for Admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetDate = searchParams.get("date"); // YYYY-MM-DD format

    // Local JWT decode — zero network
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, roles")
      .eq("id", user.id)
      .single();

    const roles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r != null);
    if (!roles.includes(1)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // 2. Route branch: Fetch specific user list for a date (Deep-dive)
    if (targetDate) {
      const { data: dateVisits, error: dateError } = await supabase
        .from("user_visits")
        .select("visited_at, user_id")
        .eq("visit_date", targetDate);

      if (dateError) {
        console.error("Date Visits Error:", dateError);
        throw dateError;
      }

      const userIds = Array.from(new Set((dateVisits || []).map(v => v.user_id)));
      let profilesData: any[] = [];
      
      if (userIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, email, temple, role")
          .in("id", userIds);
        if (profileError) console.error("Profile Fetch Error:", profileError);
        else if (profiles) profilesData = profiles;
      }

      const profileMap: Record<string, any> = {};
      profilesData.forEach(p => { profileMap[p.id] = p; });

      const usersForDate = (dateVisits || []).map((v: any) => {
        const p = profileMap[v.user_id] || {};
        return {
          id: v.user_id,
          name: p.full_name || (p.email ? p.email.split('@')[0] : "Guest"),
          email: p.email || "Confidential",
          temple: p.temple || "Unknown",
          role: p.role || 6,
          time: v.visited_at
        };
      });

      return NextResponse.json({ users: usersForDate });
    }

    // 3. MAIN SUMMARY MODE
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // A. Fetch TODAY'S Visitors directly (Always Live)
    const { data: todayVisits, error: todayError } = await supabase
      .from("user_visits")
      .select("visited_at, user_id")
      .eq("visit_date", todayStr);
    
    if (todayError) {
      console.error("Today Visits Error:", todayError);
      throw todayError;
    }

    // B. Check Redis Cache for historical stats
    let cachedStats: any = null;
    if (redis) {
      try {
        cachedStats = await redis.get("analytics:historical_stats");
      } catch (cacheErr) {
        console.error("Redis Cache Read Error:", cacheErr);
      }
    }

    let history: any[] = [];
    let totalActiveDays = 0;
    let busiestDay = "None";
    let busiestCount = 0;
    let totalUniqueDailyVisitsAcrossHistory = 0;

    if (cachedStats) {
      // SUCCESS: Load from Cache
      history = cachedStats.history || [];
      totalActiveDays = cachedStats.totalActiveDays || 0;
      busiestDay = cachedStats.busiestDay || "None";
      busiestCount = cachedStats.busiestCount || 0;
      totalUniqueDailyVisitsAcrossHistory = cachedStats.totalUniqueDailyVisitsAcrossHistory || 0;
    } else {
      // FETCH & CALCULATE
      // Fetch TOTAL unique daily visits across history
      const { count: countVal, error: countErr } = await supabase
        .from("user_visits")
        .select("*", { count: "exact", head: true });
      
      if (countErr) {
        console.error("Global Count Error:", countErr);
        throw countErr;
      }
      totalUniqueDailyVisitsAcrossHistory = countVal || 0;

      // Try fetching aggregated stats from view (Super performant)
      const { data: viewData, error: viewError } = await supabase
        .from("analytics_daily_visits")
        .select("visit_date, count")
        .order("visit_date", { ascending: false });

      if (!viewError && viewData) {
        history = viewData.slice(0, 30).map(v => ({ date: v.visit_date, count: v.count }));
        totalActiveDays = viewData.length;
        viewData.forEach(v => {
          if (v.count > busiestCount) {
            busiestCount = v.count;
            busiestDay = v.visit_date;
          }
        });
      } else {
        // FALLBACK: View does not exist yet. Limit scan to last 90 days to protect memory & Disk I/O
        console.log("[Analytics Cache Fallback] Querying last 90 days raw user_visits...");
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const minDateStr = ninetyDaysAgo.toISOString().split('T')[0];

        const { data: fallbackData } = await supabase
          .from("user_visits")
          .select("visit_date")
          .gte("visit_date", minDateStr)
          .order("visit_date", { ascending: false })
          .limit(10000);

        const dailyCounts: Record<string, number> = {};
        (fallbackData || []).forEach((v: any) => {
          dailyCounts[v.visit_date] = (dailyCounts[v.visit_date] || 0) + 1;
        });

        history = Object.entries(dailyCounts)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 30);

        totalActiveDays = Object.keys(dailyCounts).length || 1;
        Object.entries(dailyCounts).forEach(([date, count]) => {
          if (count > busiestCount) {
            busiestCount = count;
            busiestDay = date;
          }
        });
      }

      // Save to Redis cache for 15 minutes (900 seconds)
      if (redis) {
        try {
          await redis.set(
            "analytics:historical_stats",
            {
              history,
              totalActiveDays,
              busiestDay,
              busiestCount,
              totalUniqueDailyVisitsAcrossHistory
            },
            { ex: 900 }
          );
        } catch (cacheErr) {
          console.error("Redis Cache Write Error:", cacheErr);
        }
      }
    }


    // D. Fetch Profiles only for Today's Visitors
    const todayUserIds = Array.from(new Set((todayVisits || []).map(v => v.user_id)));
    let todayProfiles: any[] = [];
    
    if (todayUserIds.length > 0) {
      const { data: pData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", todayUserIds);
      if (pData) todayProfiles = pData;
    }

    const todayProfileMap: Record<string, any> = {};
    todayProfiles.forEach(p => { todayProfileMap[p.id] = p; });

    const visitorsToday = (todayVisits || []).map(v => {
      const p = todayProfileMap[v.user_id];
      return {
        id: v.user_id,
        name: p?.full_name || (p?.email ? p.email.split('@')[0] : "Guest"),
        email: p?.email || "Confidential",
        time: v.visited_at
      };
    });

    return NextResponse.json({
      stats: {
        totalDaysActive: totalActiveDays,
        visitorsInView: totalUniqueDailyVisitsAcrossHistory || 0,
        avgVisitorsPerDay: totalActiveDays > 0 ? ((totalUniqueDailyVisitsAcrossHistory || 0) / totalActiveDays).toFixed(1) : "0",
        busiestDay,
        busiestCount
      },
      history,
      todayList: visitorsToday.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        time: p.time
      }))
    });

  } catch (err: any) {
    console.error("Premium Analytics API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
