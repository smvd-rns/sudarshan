import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifySuperAdmin(req: NextRequest) {
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
  const isAuthorized = roles.includes(1);
  
  return isAuthorized ? user.id : null;
}

/**
 * ATTENDANCE CONFIGURATION API
 * Manages authorized machines and global ingestion settings.
 */

export async function GET(req: NextRequest) {
  try {
    const isAuthorized = await verifySuperAdmin(req);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: machines } = await supabase.from("attendance_machines").select("*").order("created_at", { ascending: false });
    const { data: settings } = await supabase.from("attendance_settings").select("*").eq("id", "global").single();

    return NextResponse.json({ machines, settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthorized = await verifySuperAdmin(req);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { action, data } = body;

    if (action === "add_machine") {
      const { serial_number, description, is_virtual, ingestion_start, ingestion_end, p_start, p_end, l_start, l_end } = data;

      // Auto-generate a virtual serial number if it's a virtual session and none provided
      const finalSerialNumber = (is_virtual && !serial_number)
        ? `VIRT_${Math.random().toString(36).substring(2, 9).toUpperCase()}`
        : serial_number.toUpperCase();

      const { data: newMachine, error } = await supabase
        .from("attendance_machines")
        .insert([{
          serial_number: finalSerialNumber,
          description,
          is_virtual: is_virtual || false,
          ingestion_start: ingestion_start || "02:00:00",
          ingestion_end: ingestion_end || "11:00:00",
          p_start: p_start || "04:00:00",
          p_end: p_end || "04:15:00",
          l_start: l_start || "04:15:00",
          l_end: l_end || "05:30:00"
        }])
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ machine: newMachine });
    }

    if (action === "update_settings") {
      const { sync_from_date, prasadam_start_time, prasadam_end_time, prasadam_machine_ids } = data;
      const { data: updatedSettings, error } = await supabase
        .from("attendance_settings")
        .update({
          sync_from_date,
          prasadam_start_time,
          prasadam_end_time,
          prasadam_machine_ids,
          updated_at: new Date().toISOString()
        })
        .eq("id", "global")
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ settings: updatedSettings });
    }

    if (action === "update_machine") {
      const { id, ...updates } = data;

      // Filter out undefined values to support partial updates
      const filteredUpdates: any = {};
      const allowedFields = [
        "ingestion_start", "ingestion_end",
        "p_start", "p_end",
        "l_start", "l_end",
        "description", "is_active", "serial_number", "is_virtual"
      ];
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      });

      const { data: updatedMachine, error } = await supabase
        .from("attendance_machines")
        .update(filteredUpdates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ machine: updatedMachine });
    }

    if (action === "bulk_assign_users") {
      const { machineId, userEmails, assign } = data;
      const { data: profiles, error: fetchError } = await supabase
        .from("profiles")
        .select("email, assigned_machines")
        .in("email", userEmails);

      if (fetchError) throw fetchError;

      const updates = profiles.map(profile => {
        let machines = profile.assigned_machines || [];
        if (assign) {
          if (!machines.includes(machineId)) machines = [...machines, machineId];
        } else {
          machines = machines.filter((id: string) => id !== machineId);
        }
        return supabase.from("profiles").update({ assigned_machines: machines }).eq("email", profile.email);
      });

      await Promise.all(updates);
      return NextResponse.json({ success: true });
    }

    if (action === "toggle_manual_attendance") {
      const { machineId, userEmail, date, currentStatus } = data;

      if (currentStatus === "present") {
        // Remove manual log
        const { error } = await supabase
          .from("physical_attendance")
          .delete()
          .eq("user_email", userEmail)
          .eq("check_date", date)
          .eq("serial_number", machineId);
        if (error) throw error;
      } else {
        // Add manual log
        const { error } = await supabase
          .from("physical_attendance")
          .insert([{
            user_email: userEmail,
            check_date: date,
            serial_number: machineId,
            check_time: "00:00:00", // Placeholder for manual
            is_manual: true
          }]);
        if (error) throw error;
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const isAuthorized = await verifySuperAdmin(req);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const { error } = await supabase.from("attendance_machines").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
