import { NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { safeQuery } from "@/lib/resilient-db";
import { getUserFromToken } from "@/lib/auth-utils";

async function checkManager(req: Request) {
  const user = getUserFromToken(req);
  if (!user) return false;

  const { data: profile } = await safeQuery(async () =>
    await supabase
        .from("profiles")
        .select("role, roles")
        .eq("id", user.id)
        .single(),
    "Check Admin Role"
  );

  const roles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r !== null && r !== undefined);
  return roles.includes(1) || roles.includes(5);
}

async function checkSuperAdmin(req: Request) {
  const user = getUserFromToken(req);
  if (!user) return false;

  const { data: profile } = await safeQuery(async () =>
    await supabase
        .from("profiles")
        .select("role, roles")
        .eq("id", user.id)
        .single(),
    "Check Admin Role"
  );

  const roles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r !== null && r !== undefined);
  return roles.includes(1);
}

export async function GET(request: Request) {
  try {
    if (!(await checkManager(request))) {
      return NextResponse.json({ error: "Access Denied: Management Privilege Required" }, { status: 403 });
    }

    // List all user profiles
    const { data: profiles, error } = await safeQuery(async () => 
        await supabase
            .from("profiles")
            .select("*")
            .order("created_at", { ascending: false }),
        "List User Profiles"
    );

    if (error) throw error;

    return NextResponse.json({ profiles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await checkSuperAdmin(request))) {
      return NextResponse.json({ error: "Access Denied: Super Admin Only" }, { status: 403 });
    }

    const { targetUserId, newRoles, newRole } = await request.json();

    if (!targetUserId || (!newRoles && !newRole)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!supabaseAdmin) throw new Error("Admin Client not configured");

    const updatePayload: any = {};
    if (newRoles) updatePayload.roles = newRoles;
    if (newRole) updatePayload.role = newRole;
    // Auto-fallback: if sending roles array, also sync the first primary role to the old column for safety
    if (Array.isArray(newRoles) && newRoles.length > 0) {
       updatePayload.role = newRoles[0];
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updatePayload)
      .eq("id", targetUserId)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, profile: data[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await checkSuperAdmin(request))) {
      return NextResponse.json({ error: "Access Denied: Super Admin Only" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("id");

    if (!targetUserId) {
      return NextResponse.json({ error: "Missing Target User ID" }, { status: 400 });
    }

    if (!supabaseAdmin) throw new Error("Admin Client not configured");

    // Profile delete (cascade is nice but we do it manually to be safe)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", targetUserId);

    if (profileError) throw profileError;

    // Auth user delete
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (authError) throw authError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
