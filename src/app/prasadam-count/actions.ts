"use server";

import { createClient } from "@supabase/supabase-js";
import { supabaseIdktAdmin } from "../../lib/supabaseIdkt";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type PrasadamCountHistory = {
  date: string;
  count: number;
};

/**
 * Syncs Prasadam Counts for a specific date range.
 * Efficiently aggregates raw logs and stores them in the aggregate table.
 */
export async function syncPrasadamCounts(startDate: string, endDate: string) {
  try {
    const { data: settings } = await supabaseAdmin
      .from("attendance_settings")
      .select("*")
      .eq("id", "global")
      .single();

    const startTime = settings?.prasadam_start_time || "02:00:00";
    const endTime = settings?.prasadam_end_time || "07:30:00";
    const machineIds = settings?.prasadam_machine_ids || [];

    let deviceSns: string[] = [];
    if (machineIds.length > 0) {
      const { data: machines } = await supabaseAdmin
        .from("attendance_machines")
        .select("serial_number")
        .in("id", machineIds);
      deviceSns = (machines || []).map(m => m.serial_number);
    }

    // Fetch raw logs for the range
    let query = (supabaseIdktAdmin || supabaseAdmin)
      .from("physical_attendance")
      .select("zk_user_id, check_time, device_sn")
      .gte("check_time", `${startDate}T00:00:00Z`)
      .lte("check_time", `${endDate}T23:59:59Z`);

    if (deviceSns.length > 0) {
      query = query.in("device_sn", deviceSns);
    }

    const { data: logs, error } = await query;
    if (error) throw error;

    const countsByDate: Record<string, Set<string>> = {};
    (logs || []).forEach(log => {
      // Extract raw UTC string since device time was stored literally without timezone
      const isoStr = new Date(log.check_time).toISOString();
      const dateStr = isoStr.substring(0, 10);
      const timeStr = isoStr.substring(11, 19);

      if (timeStr >= startTime && timeStr <= endTime) {
        if (!countsByDate[dateStr]) countsByDate[dateStr] = new Set();
        countsByDate[dateStr].add(log.zk_user_id);
      }

    });

    // Preparing batch upsert
    const upserts = Object.entries(countsByDate).map(([day, users]) => ({
      day,
      total_count: users.size,
      updated_at: new Date().toISOString()
    }));

    if (upserts.length > 0) {
      await supabaseAdmin
        .from("prasadam_daily_counts")
        .upsert(upserts, { onConflict: "day" });
    }

    return { success: true, synced: upserts.length };
  } catch (err: any) {
    console.error("Sync Error:", err);
    return { error: err.message };
  }
}

/**
 * Main function to fetch counts.
 * Checks for today's live count and returns historical data from the aggregate table.
 */
export async function getPrasadamCounts(page: number = 0, limit: number = 30) {
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    
    // 1. Fetch settings
    const { data: settings } = await supabaseAdmin
      .from("attendance_settings")
      .select("*")
      .eq("id", "global")
      .single();

    // 2. BACKFILL: If aggregate table is empty, sync last 30 days once
    const { count: aggregateCount } = await supabaseAdmin
      .from("prasadam_daily_counts")
      .select("*", { count: 'exact', head: true });

    if (aggregateCount === 0) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startStr = thirtyDaysAgo.toISOString().split('T')[0];
      await syncPrasadamCounts(startStr, today);
    }

    // 3. LIVE SYNC TODAY: Ensure today's count is fresh
    await syncPrasadamCounts(today, today);

    // 4. FETCH AGGREGATE HISTORY
    const { data: history, error: historyError, count } = await supabaseAdmin
      .from("prasadam_daily_counts")
      .select("*", { count: "exact" })
      .order("day", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (historyError) throw historyError;

    return {
      history: (history || []).map(h => ({ date: h.day, count: h.total_count })),
      totalCount: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      settings: {
        startTime: settings?.prasadam_start_time || "02:00:00",
        endTime: settings?.prasadam_end_time || "07:30:00",
        machineCount: settings?.prasadam_machine_ids?.length || 0
      }
    };

  } catch (error: any) {
    console.error("getPrasadamCounts Error:", error);
    return { error: error.message };
  }
}
