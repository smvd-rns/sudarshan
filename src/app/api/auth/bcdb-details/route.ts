import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Local JWT decode — zero network
    const user = getUserFromToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const normalizedEmail = email.toLowerCase().trim();
    const tokenEmail = user.email?.toLowerCase().trim() || "";

    // If requesting someone else's details, verify that requester is Admin/Manager
    if (normalizedEmail !== tokenEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, roles")
        .eq("id", user.id)
        .single();
      
      const roles = (Array.isArray(profile?.roles) ? profile.roles : [profile?.role])
        .filter(r => r !== null && r !== undefined)
        .map(Number);
      
      const isAuthorized = roles.includes(1) || roles.includes(5);
      if (!isAuthorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from("bcdb")
      .select("*")
      .or(`email_id.ilike.${normalizedEmail},email_address.ilike.${normalizedEmail}`)
      .eq("is_deleted", false)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "No BCDB record found" }, { status: 404 });

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("BCDB Details API Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
