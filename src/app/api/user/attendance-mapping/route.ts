import { NextRequest, NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { getUserFromToken } from "@/lib/auth-utils";


export async function GET(req: NextRequest) {
  try {
    // Local JWT decode — zero network
    const user = getUserFromToken(req);
    if (!user || !user.email) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const normalizedEmail = user.email.toLowerCase().trim();

    // Check if user is BCDB verified
    const { data: profile, error: profileError } = await supabaseAdmin!
      .from("profiles")
      .select("is_bcdb_verified")
      .eq("email", normalizedEmail)
      .single();

    if (profileError) throw profileError;

    if (!profile?.is_bcdb_verified) {
      return NextResponse.json({
        isBcdb: false,
        machines: [],
        mappings: []
      });
    }

    // Fetch active physical machines (open to all authenticated users)
    const { data: machines, error: machinesError } = await supabaseAdmin!
      .from("attendance_machines")
      .select("id, serial_number, description")
      .eq("is_active", true)
      .eq("is_virtual", false)
      .order("description", { ascending: true });

    if (machinesError) throw machinesError;

    // Fetch existing mappings for this user email
    const { data: mappings, error: mappingsError } = await supabaseAdmin!
      .from("attendance_user_mapping")
      .select("id, machine_id, zk_user_id")
      .eq("user_email", normalizedEmail);

    if (mappingsError) throw mappingsError;

    return NextResponse.json({
      isBcdb: true,
      machines: machines || [],
      mappings: mappings || []
    });

  } catch (error: any) {
    console.error("[User Attendance Mapping GET Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Local JWT decode — zero network
    const user = getUserFromToken(req);
    if (!user || !user.email) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const normalizedEmail = user.email.toLowerCase().trim();

    const body = await req.json();
    const { machineId, zkUserId } = body;

    if (!machineId || !zkUserId) {
      return NextResponse.json({ error: "machineId and zkUserId are required" }, { status: 400 });
    }

    const zkUserIdStr = String(zkUserId).trim();
    if (!zkUserIdStr) {
      return NextResponse.json({ error: "Machine User ID cannot be empty" }, { status: 400 });
    }

    // Verify BCDB status before allowing mapping
    const { data: profile, error: profileError } = await supabaseAdmin!
      .from("profiles")
      .select("is_bcdb_verified")
      .eq("email", normalizedEmail)
      .single();

    if (profileError || !profile?.is_bcdb_verified) {
      return NextResponse.json({ error: "Only BCDB verified users can map biometric machines." }, { status: 403 });
    }

    // Check if user is already mapped to this machine
    const { data: existingMapping, error: mapCheckError } = await supabaseAdmin!
      .from("attendance_user_mapping")
      .select("id")
      .eq("machine_id", machineId)
      .eq("user_email", normalizedEmail)
      .maybeSingle();

    if (mapCheckError) throw mapCheckError;
    if (existingMapping) {
      return NextResponse.json({ error: "You are already mapped to this machine." }, { status: 400 });
    }

    // Check if zkUserId is already mapped to another user on this machine
    const { data: duplicateZk, error: zkCheckError } = await supabaseAdmin!
      .from("attendance_user_mapping")
      .select("id, user_email")
      .eq("machine_id", machineId)
      .eq("zk_user_id", zkUserIdStr)
      .maybeSingle();

    if (zkCheckError) throw zkCheckError;
    if (duplicateZk) {
      return NextResponse.json({ 
        error: `Machine User ID ${zkUserIdStr} is already mapped to another user on this machine.` 
      }, { status: 400 });
    }

    // Create the new mapping
    const { data: newMapping, error: insertError } = await supabaseAdmin!
      .from("attendance_user_mapping")
      .insert([{
        machine_id: machineId,
        zk_user_id: zkUserIdStr,
        user_email: normalizedEmail
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      mapping: newMapping
    });

  } catch (error: any) {
    console.error("[User Attendance Mapping POST Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
