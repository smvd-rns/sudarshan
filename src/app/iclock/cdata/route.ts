import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseIdktAdmin } from "../../../lib/supabaseIdkt";
import { getCached } from "../../../lib/cache";

/**
 * ZK-ADMS COMPATIBILITY LAYER - Optimized for Multiple ZKTeco Devices
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getCachedMachine(sn: string) {
  const cacheKey = `machine:${sn.toUpperCase().trim()}`;
  try {
    return await getCached(
      cacheKey,
      async () => {
        const { data: machine, error } = await supabase
          .from("attendance_machines")
          .select("is_active, ingestion_start, ingestion_end")
          .eq("serial_number", sn.toUpperCase().trim())
          .eq("is_active", true)
          .single();
        
        if (error) throw error;
        return machine || null;
      },
      300 // Cache for 5 minutes
    );
  } catch (err) {
    console.error(`[Redis Machine Cache] Error fetching or storing machine: ${sn}`, err);
    return null;
  }
}

async function getCachedSettings() {
  const cacheKey = `settings:global`;
  try {
    return await getCached(
      cacheKey,
      async () => {
        const { data: settings, error } = await supabase
          .from("attendance_settings")
          .select("*")
          .eq("id", "global")
          .single();
        
        if (error) throw error;
        return settings || null;
      },
      300 // Cache for 5 minutes
    );
  } catch (err) {
    console.error("[Redis Settings Cache] Error fetching or storing global settings", err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sn = searchParams.get("SN")?.toUpperCase();

  if (!sn) return new Response("SN_REQUIRED", { status: 400 });

  const machine = await getCachedMachine(sn);

  if (!machine) {
    return new Response("UNAUTHORIZED_DEVICE", { status: 401 });
  }

  return new Response("OK", {
    headers: { 
      "Content-Type": "text/plain",
      "Server": "ZK Web Server" 
    }
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sn = searchParams.get("SN")?.toUpperCase();
  const table = searchParams.get("table");

  if (!sn) return new Response("SN_REQUIRED", { status: 400 });

  const machine = await getCachedMachine(sn);

  if (!machine) {
    return new Response("UNAUTHORIZED_DEVICE", { status: 401 });
  }

  const settings = await getCachedSettings();

  const startTime = machine.ingestion_start || "02:00:00";
  const endTime = machine.ingestion_end || "11:00:00";
  const syncFromDate = settings?.sync_from_date ? new Date(settings.sync_from_date) : new Date();

  try {
    const text = await req.text();
    
    // Handle ATTLOG or OPLOG
    if (table === "ATTLOG" || table === "OPLOG" || text.includes("ATTLOG") || text.includes("OPLOG")) {
      const lines = text.trim().split("\n");
      const logs: any[] = [];
      
      lines.forEach(line => {
          if (!line.trim()) return;
          const parts = line.split("\t"); 
          
          let userId = "0";
          let timestampStr = "";
          let status = 0;
          let verifyType = 0;

           // 1. Explicit OPLOG filter
           if (line.includes("OPLOG") || parts[0].includes("OPLOG")) {
              return; 
           }

           if (parts[0].includes("ATTLOG")) {
              userId = parts[0].split(" ").pop() || "0";
              timestampStr = parts[1] || "";
              status = parseInt(parts[2]) || 0;
              verifyType = parseInt(parts[3]) || 0;
           } else {
              userId = parts[0] || "0";
              timestampStr = parts[1] || "";
              status = parseInt(parts[2]) || 0;
              verifyType = parseInt(parts[3]) || 0;
           }

           // 2. Filter out invalid/non-user entries
           if (userId === "0" || !userId || userId.toLowerCase() === "null") {
              return;
           }

           // DYNAMIC FILTERS
           if (timestampStr) {
             const [dateStr, timeStr] = timestampStr.split(" ");
             const recordDate = new Date(dateStr);
             
             if (recordDate < syncFromDate) return;

             if (timeStr) {
                const [h, m] = timeStr.split(":").map(Number);
                const [startH, startM] = startTime.split(":").map(Number);
                const [endH, endM] = endTime.split(":").map(Number);
                
                const recMinutes = h * 60 + m;
                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;

                if (recMinutes >= startMinutes && recMinutes <= endMinutes) {
                   logs.push({
                       device_sn: sn,
                       zk_user_id: userId,
                       check_time: timestampStr,
                       status,
                       verify_type: verifyType,
                       raw_payload: line
                   });
                }
             }
          }
      });

      if (logs.length > 0) {
        await (supabaseIdktAdmin || supabase).from("physical_attendance").insert(logs);
      }
    }

    return new Response("OK", {
      headers: { "Content-Type": "text/plain", "Server": "ZK Web Server" }
    });

  } catch (error: any) {
    return new Response("OK", { status: 200 });
  }
}
