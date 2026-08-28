import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Local JWT decode — zero network call to Supabase Auth
    const user = getUserFromToken(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check Role - Only Super Admin (Role 1)
    const { data: profile } = await supabase
      .from("profiles")
      .select("roles")
      .eq("id", user.id)
      .single();

    const roles = Array.isArray(profile?.roles) ? profile.roles : [];
    if (!roles.includes(1)) {
      return NextResponse.json({ error: "Forbidden: Only Super Admin can perform bulk import" }, { status: 403 });
    }

    const { records } = await req.json();
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }

    // records: { full_name, types: string[], date }[]
    
    // 1. Get all unique names to map to emails
    // We fetch all profiles to perform case-insensitive matching in memory
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("email, full_name");
    
    const nameToEmail = new Map(
      (allProfiles || [])
        .filter(p => !!p.full_name)
        .map(p => [p.full_name.toLowerCase().trim(), p.email])
    );
    
    // 2. Prepare upsert data
    const upsertMap = new Map<string, any>(); // key: email_date

    for (const rec of records) {
      const email = nameToEmail.get(rec.full_name.toLowerCase().trim());
      if (!email) continue;

      const date = rec.date;
      const key = `${email}_${date}`;
      
      const update: any = {
        user_email: email,
        date: date,
        h7am: 0,
        h740am: 0,
        hpdc: 0,
        hcustom_mins: 0
      };

      const hasType = (pattern: string) => rec.types.some((t: string) => {
        const norm = t.toLowerCase().trim();
        if (pattern === "7am") {
          return norm === "7:00" || norm === "7:00 am" || norm === "7 am" || norm === "7:00:00 am";
        }
        if (pattern === "740am") {
          return norm === "7:40" || norm === "7:40 am" || norm === "7:40:00 am";
        }
        return norm.includes(pattern.toLowerCase());
      });

      if (hasType("7am")) update.h7am = 30;
      if (hasType("740am")) update.h740am = 30;
      if (hasType("PDC")) update.hpdc = 90;

      // Merge if multiple entries for same user/date exist in the import
      if (upsertMap.has(key)) {
        const existing = upsertMap.get(key);
        existing.h7am = Math.max(existing.h7am, update.h7am);
        existing.h740am = Math.max(existing.h740am, update.h740am);
        existing.hpdc = Math.max(existing.hpdc, update.hpdc);
      } else {
        upsertMap.set(key, update);
      }
    }

    const rows = Array.from(upsertMap.values());
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid users found for the provided names" }, { status: 400 });
    }

    // 3. Fetch existing records for these users/dates to merge
    const { data: existingDbRecords } = await supabase
      .from("harinam_attendance")
      .select("*")
      .in("user_email", rows.map(r => r.user_email))
      .in("date", [...new Set(rows.map(r => r.date))]);

    const dbMap = new Map((existingDbRecords || []).map(r => [`${r.user_email}_${r.date}`, r]));

    const finalRows = rows.map(r => {
      const dbRow = dbMap.get(`${r.user_email}_${r.date}`);
      return {
        ...r,
        h7am: Math.max(r.h7am, dbRow?.h7am || 0),
        h740am: Math.max(r.h740am, dbRow?.h740am || 0),
        hpdc: Math.max(r.hpdc, dbRow?.hpdc || 0),
        hcustom_mins: dbRow?.hcustom_mins || 0,
        hcustom_place: dbRow?.hcustom_place || null
      };
    });

    // 4. Perform bulk upsert in chunks of 500 to avoid timeout/size limits
    const chunkSize = 500;
    for (let i = 0; i < finalRows.length; i += chunkSize) {
      const chunk = finalRows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("harinam_attendance")
        .upsert(chunk, { onConflict: "user_email,date" });
      if (error) throw error;
    }

    return NextResponse.json({ success: true, count: finalRows.length });
  } catch (error: any) {
    console.error("Bulk Import Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
