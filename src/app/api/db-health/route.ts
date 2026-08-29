import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    // Perform a fast query directly to the database (bypassing Redis cache)
    const { error } = await supabase.from("profiles").select("id").limit(1).maybeSingle();
    if (error) throw error;
    
    return NextResponse.json({ status: "online" });
  } catch (err: any) {
    console.warn("[DB Health Check] Database is offline:", err.message || err);
    return NextResponse.json({ status: "offline", error: err.message || err }, { status: 503 });
  }
}
