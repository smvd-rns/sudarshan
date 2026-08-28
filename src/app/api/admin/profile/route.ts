import { NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { getUserFromToken } from "@/lib/auth-utils";

export async function POST(request: Request) {
  try {
    // Local JWT decode — zero network call to Supabase Auth
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const { full_name, mobile, temple } = await request.json();

    if (!full_name || !mobile || !temple) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    // Update the profile using the Admin Client to bypass RLS and ensure success
    const { data, error } = await supabaseAdmin!
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        full_name,
        mobile,
        temple,
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, profile: data[0] });
  } catch (error: any) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
