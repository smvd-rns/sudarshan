import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getRequestUser(req: NextRequest) {
  // Local JWT decode — zero network call to Supabase Auth
  return getUserFromToken(req);
}

async function isSuperAdmin(userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return Number(profile?.role) === 1;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: machines, error: machinesError } = await supabase
      .from("attendance_machines")
      .select("id, serial_number, description, is_virtual, is_active")
      .eq("is_virtual", true)
      .order("created_at", { ascending: false });
    if (machinesError) throw machinesError;

    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .order("full_name", { ascending: true });
    if (usersError) throw usersError;

    const { data: assignments, error: assignmentsError } = await supabase
      .from("virtual_machine_incharge_mapping")
      .select("id, machine_id, incharge_user_id, incharge_user_email, created_at");
    if (assignmentsError) throw assignmentsError;

    return NextResponse.json({ machines, users, assignments });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { action, data } = body;

    if (action === "assign_incharge") {
      const { machine_id, incharge_user_id } = data || {};
      if (!machine_id || !incharge_user_id) {
        return NextResponse.json({ error: "Missing machine or user" }, { status: 400 });
      }

      const { data: inchargeProfile, error: inchargeError } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("id", incharge_user_id)
        .single();
      if (inchargeError || !inchargeProfile?.email) {
        return NextResponse.json({ error: "Invalid incharge user" }, { status: 400 });
      }

      const { error: assignError } = await supabase
        .from("virtual_machine_incharge_mapping")
        .upsert(
          [{
            machine_id,
            incharge_user_id,
            incharge_user_email: inchargeProfile.email.toLowerCase().trim(),
            assigned_by: user.id,
          }],
          { onConflict: "machine_id,incharge_user_id" },
        );
      if (assignError) throw assignError;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const assignmentId = searchParams.get("id");
    if (!assignmentId) {
      return NextResponse.json({ error: "Assignment id required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("virtual_machine_incharge_mapping")
      .delete()
      .eq("id", assignmentId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
