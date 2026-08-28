import { NextRequest, NextResponse } from "next/server";
import { safeAuth, safeQuery } from "@/lib/resilient-db";
import { sendPushToUsers, notifyManagers } from "@/lib/notifications";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { getUserFromToken } from "@/lib/auth-utils";



// GET: Fetch submissions (Manager only)
export async function GET(req: NextRequest) {
  try {
    // Local JWT decode — zero network call to Supabase Auth
    const user = getUserFromToken(req);
    if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    // Fetch Role (Use supabaseAdmin to ensure we can see the user's role regardless of RLS)
    const { data: profile } = await safeQuery(async () => 
        await supabaseAdmin!
            .from("profiles")
            .select("role, roles")
            .eq("id", user.id)
            .single(),
        "Travel Desk GET Profile"
    );

    const roles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r != null);
    const isManager = roles.includes(1) || roles.includes(5);
    
    // Use supabaseAdmin to bypass RLS as auth.uid() isn't set on server-side requests
    let dbQuery = supabaseAdmin!
        .from("travel_submissions")
        .select("*")
        .eq("is_deleted", false);

    // If NOT manager, restrict to OWN data
    if (!isManager) {
      dbQuery = dbQuery.or(`user_id.eq.${user.id},email_id.ilike.${user.email}`);
    }

    const { data, error } = await safeQuery(async () => 
        await dbQuery.order("created_at", { ascending: false }),
        "Travel Desk GET Submissions"
    );

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Travel Desk GET Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Submit a form (BCDB users only)
export async function POST(req: NextRequest) {
  try {
    // Local JWT decode — zero network call to Supabase Auth
    const user = getUserFromToken(req);
    if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const body = await req.json();
    // ... validation logic stays same ...
    const { 
      email_id, 
      devotee_name, 
      departure_date, 
      return_date, 
      places_of_travel, 
      purpose_of_travel, 
      accompanying_bcari, 
      counselor_email 
    } = body;

    // Validation
    if (!email_id || !devotee_name || !departure_date || !return_date || !places_of_travel || !purpose_of_travel) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
    }

    const { data, error } = await safeQuery(async () => 
        await supabaseAdmin!
            .from("travel_submissions")
            .insert([{
                user_id: user.id,
                email_id,
                devotee_name,
                departure_date,
                return_date,
                places_of_travel,
                purpose_of_travel,
                accompanying_bcari,
                counselor_email,
                status: 'Pending'
            }])
            .select()
            .single(),
        "Travel Desk POST Submission"
    );

    if (error) throw error;

    // BACKGROUND TASK: Notify All Managers (Role 5) and Super Admins (Role 1)
    (async () => {
        await notifyManagers({
            title: "New Travel Request!",
            body: `${devotee_name} has logged a new movement to ${places_of_travel}.`,
            url: "/travel-desk",
            icon: "/favicon.ico"
        });
    })();

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Travel Desk POST Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Update status (Manager only)
export async function PATCH(req: NextRequest) {
    try {
      // Local JWT decode — zero network call to Supabase Auth
      const user = getUserFromToken(req);
      if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  
      if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration missing" }, { status: 500 });

      // Check if user is Manager (Role 5) or Super Admin (Role 1)
      const { data: profile } = await safeQuery(async () => 
        await supabaseAdmin!.from("profiles").select("role, roles").eq("id", user.id).single(),
        "Travel Desk PATCH Profile"
      );
      const roles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r != null);
      if (!roles.includes(1) && !roles.includes(5)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  
      const body = await req.json();
      const { id, status } = body;
  
      const { data, error } = await safeQuery(async () => 
        await supabaseAdmin!
            .from("travel_submissions")
            .update({ status })
            .eq("id", id)
            .select()
            .single(),
        "Travel Desk PATCH Update"
      );
  
      if (error) throw error;

      // BACKGROUND TASK: Notify the Devotee about the status change
      (async () => {
        await sendPushToUsers([data.user_id], {
            title: "Travel Request Update",
            body: `Your travel request to ${data.places_of_travel} has been marked as ${status}.`,
            url: "/travel-desk",
            icon: "/favicon.ico"
        });
      })();

      return NextResponse.json({ data });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

