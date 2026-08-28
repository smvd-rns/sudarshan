import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyAdminOrManager(req: NextRequest) {
  // Local JWT decode - zero network
  const user = getUserFromToken(req);
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, roles")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const roles = Array.isArray(profile.roles) ? profile.roles : [profile.role].filter(r => r != null);
  // Allow Super Admin (1) or Manager (5)
  const isAuthorized = roles.includes(1) || roles.includes(5);
  
  return isAuthorized ? user.id : null;
}

export async function GET(req: NextRequest) {
  try {
    const reviewerId = await verifyAdminOrManager(req);
    if (!reviewerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "";
    const showDeleted = searchParams.get("showDeleted") === "true";
    
    let dbQuery = supabase.from("bcdb").select("*").order("created_at", { ascending: false });
    
    // Toggle strictly between active and archived pools based on parameter
    if (showDeleted) {
      dbQuery = dbQuery.eq("is_deleted", true);
    } else {
      dbQuery = dbQuery.eq("is_deleted", false);
    }
    
    if (query) {
      dbQuery = dbQuery.or(`legal_name.ilike.%${query}%,initiated_name.ilike.%${query}%,email_id.ilike.%${query}%,contact_no.ilike.%${query}%,whatsapp_no.ilike.%${query}%,aadhar_number.ilike.%${query}%,pan_card.ilike.%${query}%,center.ilike.%${query}%,counsellor.ilike.%${query}%,spiritual_master.ilike.%${query}%,primary_services.ilike.%${query}%,secondary_services.ilike.%${query}%,address_adhar.ilike.%${query}%,parents_address.ilike.%${query}%,custom_counsellor.ilike.%${query}%,blood_group.ilike.%${query}%,prasadam.ilike.%${query}%`);
    }

    const { data, error } = await dbQuery;
    if (error) {
      console.error("BCDB GET Error:", error);
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message, 
      details: error,
      hint: "Check if the 'bcdb' table exists and the 'uuid-ossp' extension is enabled in Supabase."
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const reviewerId = await verifyAdminOrManager(req);
    if (!reviewerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { action, data } = body;

    if (action === "upsert") {
      const { id, ...record } = data;
      
      const { data: upserted, error } = await supabase
        .from("bcdb")
        .upsert([{ id: id || undefined, ...record }])
        .select()
        .single();
      
      if (error) {
        console.error("BCDB UPSERT Error:", error);
        throw error;
      }
      return NextResponse.json({ data: upserted });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message, 
      details: error,
      hint: "Ensure 'email_id' has a UNIQUE constraint and you are sending valid data."
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const reviewerId = await verifyAdminOrManager(req);
    if (!reviewerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const { error } = await supabase.from("bcdb").update({ is_deleted: true }).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
