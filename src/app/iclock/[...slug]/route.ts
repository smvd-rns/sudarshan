import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseIdktAdmin } from "../../../lib/supabaseIdkt";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simple in-memory cache with TTL
type CacheEntry<T> = {
  data: T;
  expiry: number;
};

const machineCache = new Map<string, CacheEntry<any>>();
const settingsCache: { entry: CacheEntry<any> | null } = { entry: null };

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getCachedMachine(sn: string) {
  const now = Date.now();
  const cached = machineCache.get(sn);
  
  if (cached && cached.expiry > now) {
    return cached.data;
  }
  
  const { data: machine } = await supabase
    .from("attendance_machines")
    .select("is_active, ingestion_start, ingestion_end")
    .eq("serial_number", sn)
    .eq("is_active", true)
    .single();
    
  // Cache negative hits for 30s to prevent spam, active machines for 5 minutes
  const ttl = machine ? CACHE_TTL_MS : 30 * 1000;
  machineCache.set(sn, {
    data: machine || null,
    expiry: now + ttl
  });
  
  return machine || null;
}

async function getCachedSettings() {
  const now = Date.now();
  if (settingsCache.entry && settingsCache.entry.expiry > now) {
    return settingsCache.entry.data;
  }
  
  const { data: settings } = await supabase
    .from("attendance_settings")
    .select("*")
    .eq("id", "global")
    .single();
    
  settingsCache.entry = {
    data: settings || null,
    expiry: now + CACHE_TTL_MS
  };
  
  return settings || null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sn = searchParams.get("SN")?.toUpperCase();

  if (!sn) return new Response("SN_REQUIRED", { status: 400 });

  const machine = await getCachedMachine(sn);

  if (!machine) {
    console.warn(`[ATTENDANCE-DEBUG] GET Unauthorized or inactive SN: ${sn}`);
    return new Response("UNAUTHORIZED_DEVICE", { status: 401 });
  }

  return new Response("OK", { headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { searchParams } = new URL(req.url);
  const sn = searchParams.get("SN")?.toUpperCase();
  const tableParam = searchParams.get("table");
  const text = await req.text();

  if (!sn) return new Response("SN_REQUIRED", { status: 400 });

  // 1. Auth Check
  const machine = await getCachedMachine(sn);

  if (!machine) {
    console.error(`[ATTENDANCE-DEBUG] POST FAILED AUTH for SN: ${sn}. Not found/Inactive`);
    return new Response("UNAUTHORIZED_DEVICE", { status: 401 });
  }

  // 2. Fetch Global Sync Filter
  const settings = await getCachedSettings();

  const ingestionStart = machine.ingestion_start || "02:00:00";
  const ingestionEnd = machine.ingestion_end || "11:00:00";
  const syncFromDate = settings?.sync_from_date ? new Date(settings.sync_from_date) : new Date();

  console.log(`[ATTENDANCE-DEBUG] Processing SN: ${sn} | Path: ${req.url} | Ingestion Window: ${ingestionStart}-${ingestionEnd}`);

  // 3. Process Payload
  if (text.includes("ATTLOG") || text.includes("OPLOG") || tableParam?.includes("ATTLOG") || tableParam?.includes("OPLOG")) {
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
           if (line.includes("OPLOG") || tableParam?.includes("OPLOG") || parts[0].includes("OPLOG")) {
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

           if (timestampStr) {
              const [dateStr, timeStr] = timestampStr.split(" ");
              const recordDate = new Date(dateStr);
              
              // A. Sync Start Date Filter
              if (recordDate < syncFromDate) {
                  return;
              }

             // B. Machine (Ingestion) Window Filter
             if (timeStr) {
                const [h, m] = timeStr.split(":").map(Number);
                const [sH, sM] = ingestionStart.split(":").map(Number);
                const [eH, eM] = ingestionEnd.split(":").map(Number);
                
                const recMin = h * 60 + m;
                const startMin = sH * 60 + sM;
                const endMin = eH * 60 + eM;

                if (recMin >= startMin && recMin <= endMin) {
                   logs.push({
                       device_sn: sn,
                       zk_user_id: userId,
                       check_time: timestampStr,
                       status,
                       verify_type: verifyType,
                       raw_payload: line
                   });
                } else {
                   console.log(`[ATTENDANCE-DEBUG] Skip: Outside Ingestion Window (${timeStr}) for SN: ${sn}`);
                }
             }
          }
      });

      if (logs.length > 0) {
        const { error: insErr } = await (supabaseIdktAdmin || supabase).from("physical_attendance").insert(logs);
        if (insErr) {
            console.error(`[ATTENDANCE-DEBUG] DB Error: ${insErr.message}`);
        } else {
            console.log(`[ATTENDANCE-DEBUG] Success: Pushed ${logs.length} records for SN: ${sn}`);
        }
      }
  }

  return new Response("OK", { headers: { "Content-Type": "text/plain" } });
}
