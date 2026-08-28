import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserFromToken } from "@/lib/auth-utils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);


export async function GET(req: NextRequest) {
  try {
    // Local JWT decode — zero network call to Supabase Auth
    const user = getUserFromToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // We only return specific public fields to ensure privacy
    const { data, error } = await supabase
      .from("bcdb")
      .select("legal_name, initiated_name, email_id, contact_no, center, photo_url")
      .eq("is_deleted", false)
      .order("initiated_name", { ascending: true });

    if (error) {
      console.error("Directory API Error:", error);
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
