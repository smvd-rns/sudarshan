import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    // Local JWT decode — zero network call to Supabase Auth
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, roles")
      .eq("id", user.id)
      .single();

    const roles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r != null);
    if (!roles.includes(1)) {
      return NextResponse.json({ error: "Access Denied: Super Admin Only" }, { status: 403 });
    }

    // 2. Fetch BCDB records
    const { data: bcdbData, error: bcdbError } = await supabase
      .from("bcdb")
      .select("email_id, initiated_name, contact_no, center")
      .not("email_id", "is", null);

    if (bcdbError) throw bcdbError;

    // 3. Fetch existing profiles to check for duplicates
    const { data: existingProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email");

    if (profilesError) throw profilesError;

    const existingEmails = new Set(existingProfiles?.map(p => p.email?.toLowerCase()) || []);

    // 4. Process Records one by one to ensure Shadow Accounts are created correctly
    let syncedCount = 0;
    const errors: string[] = [];

    const pendingRecords = bcdbData.filter(record => 
      record.email_id && !existingEmails.has(record.email_id.toLowerCase())
    );

    for (const record of pendingRecords) {
      try {
        const email = record.email_id.toLowerCase();
        let targetUserId: string | null = null;

        // A. Check if the user already exists in Auth (even if not in profiles)
        // Note: listUsers is the only way to search by email in Admin API easily without knowing UID
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        const existingAuthUser = users.find(u => u.email?.toLowerCase() === email);

        if (existingAuthUser) {
          targetUserId = existingAuthUser.id;
        } else {
          // B. Create a Shadow Account if they don't exist anywhere
          const { data: { user: newUser }, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            email_confirm: true,
            user_metadata: { 
              full_name: record.initiated_name || "",
              source: "bcdb_sync"
            }
          });

          if (createError) {
             console.error(`Error creating auth user for ${email}:`, createError.message);
             errors.push(`${email}: ${createError.message}`);
             continue;
          }
          if (newUser) targetUserId = newUser.id;
        }

        if (targetUserId) {
          // C. Insert the profile now that we have a valid Auth ID
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({
              id: targetUserId,
              email: email,
              full_name: record.initiated_name || "",
              mobile: record.contact_no || "",
              temple: record.center || "",
              role: 6,
              updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

          if (profileError) {
             console.error(`Error creating profile for ${email}:`, profileError.message);
             errors.push(`${email}: Profile Insert Error - ${profileError.message}`);
             continue;
          }
          syncedCount++;
        }

      } catch (err: any) {
        console.error(`Unexpected sync error for record:`, err);
        errors.push(`General error: ${err.message}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      count: syncedCount, 
      message: `Successfully migrated ${syncedCount} devotees to profiles.`,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error("Migration Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
