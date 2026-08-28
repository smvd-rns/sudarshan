import { NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { getUserFromToken } from "@/lib/auth-utils";

// Helper to check for upload rights (Super Admin or BC Video Uploader)
async function canUpload(request: Request) {
  // Local JWT decode — zero network call to Supabase Auth
  const user = getUserFromToken(request);
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, roles")
    .eq("id", user.id)
    .single();

  const roles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r != null);
  return roles.includes(1) || roles.includes(2);
}

export async function GET(request: Request) {
  try {
    if (!(await canUpload(request))) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const { data: lectures, error } = await supabase
      .from("lectures")
      .select("*")
      .order("date", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ lectures });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await canUpload(request))) {
      return NextResponse.json({ error: "Access Denied: Insufficient Role" }, { status: 403 });
    }

    const body = await request.json();
    
    // Handle both single (object) and bulk (array) inputs
    const lectures = Array.isArray(body) ? body : [body];

    if (lectures.length === 0) {
        return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    // Basic validation
    for (const item of lectures) {
        if (!item.youtube_id || !item.title || !item.speaker_name || !item.date) {
            return NextResponse.json({ error: "Missing required fields in one or more items" }, { status: 400 });
        }
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from("lectures")
      .insert(lectures)
      .select();

    if (error) {
       console.error("Supabase insert error:", error);
       return NextResponse.json({ error: "Failed to save lectures" }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data.length }, { status: 201 });

  } catch (error: any) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await canUpload(request))) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const { id, title, speaker_name, date } = await request.json();
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    const { error } = await supabaseAdmin
      .from("lectures")
      .update({ title, speaker_name, date })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await canUpload(request))) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    const { error } = await supabaseAdmin
      .from("lectures")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
