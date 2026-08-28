import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAuthenticatedUser(req: NextRequest) {
  // Local JWT decode — zero network call to Supabase Auth
  return getUserFromToken(req);
}

async function getAssignedMachineForIncharge(userId: string) {
  const { data: mapping } = await supabase
    .from("virtual_machine_incharge_mapping")
    .select("machine_id")
    .eq("incharge_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!mapping?.machine_id) return null;

  const { data: machine } = await supabase
    .from("attendance_machines")
    .select("id, serial_number, description")
    .eq("id", mapping.machine_id)
    .maybeSingle();

  return machine || null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const machine = await getAssignedMachineForIncharge(user.id);
    if (!machine) return NextResponse.json({ machine: null, users: [] });

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    const { data: machineMappings, error: mappingError } = await supabase
      .from("attendance_user_mapping")
      .select("user_email")
      .eq("machine_id", machine.id);
    if (mappingError) throw mappingError;

    const emails = [
      ...new Set(
        (machineMappings || [])
          .map((m: any) => (m?.user_email || "").toLowerCase().trim())
          .filter(Boolean),
      ),
    ];

    if (emails.length === 0) {
      return NextResponse.json({ machine, users: [] });
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .in("email", emails);
    if (profileError) throw profileError;

    const profileMap = new Map<string, string>();
    (profiles || []).forEach((p: any) => {
      const email = (p?.email || "").toLowerCase().trim();
      if (!email) return;
      profileMap.set(email, p?.full_name || "");
    });

    const users = emails.map((email) => ({
      email,
      full_name: profileMap.get(email) || email.split("@")[0],
    }));

    // Fetch existing attendance for the date if provided
    let existingAttendance: any[] = [];
    if (date) {
      const { data: attendance } = await supabase
        .from("virtual_machine_attendance")
        .select("user_email, status")
        .eq("machine_id", machine.id)
        .eq("date", date);
      existingAttendance = attendance || [];
    }

    return NextResponse.json({ machine, users, records: existingAttendance });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const machine = await getAssignedMachineForIncharge(user.id);
    if (!machine) {
      return NextResponse.json({ error: "No assigned virtual machine" }, { status: 400 });
    }

    const body = await req.json();
    const { action, data } = body || {};
    if (action !== "bulk_mark_vm_attendance") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const date = data?.date;
    const records = Array.isArray(data?.records) ? data.records : [];
    if (!date || records.length === 0) {
      return NextResponse.json({ error: "Missing date or records" }, { status: 400 });
    }

    const upsertRows = records.map((r: any) => ({
      machine_id: machine.id,
      user_email: String(r?.email || "").toLowerCase().trim(),
      date,
      status: r?.status === "P" ? "P" : "A",
      marked_by: user.id,
    })).filter((r: any) => !!r.user_email);

    if (upsertRows.length === 0) {
      return NextResponse.json({ error: "No valid records to save" }, { status: 400 });
    }

    const { error } = await supabase
      .from("virtual_machine_attendance")
      .upsert(upsertRows, { onConflict: "machine_id,user_email,date" });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
