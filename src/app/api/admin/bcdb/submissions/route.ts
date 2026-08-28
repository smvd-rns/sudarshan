import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyAdminOrManager(req: NextRequest) {
  // Local JWT decode — zero network
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
    if (!reviewerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending"; // pending, approved, rejected, all
    const query = searchParams.get("query") || "";

    let dbQuery = supabase.from("bcdb_submissions").select("*").order("submitted_at", { ascending: false });

    if (status !== "all") {
      dbQuery = dbQuery.eq("status", status);
    }

    if (query) {
      dbQuery = dbQuery.or(`legal_name.ilike.%${query}%,initiated_name.ilike.%${query}%,email_id.ilike.%${query}%,contact_no.ilike.%${query}%`);
    }

    const { data, error } = await dbQuery;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("[SUBMISSIONS GET ERROR]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const reviewerId = await verifyAdminOrManager(req);
    if (!reviewerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { action, submissionId, reason } = body;

    if (!submissionId) {
      return NextResponse.json({ error: "Submission ID is required" }, { status: 400 });
    }

    // 1. Fetch the Submission Details
    const { data: submission, error: fetchError } = await supabase
      .from("bcdb_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json({ error: "Submission record not found." }, { status: 404 });
    }

    if (submission.status !== "pending") {
      return NextResponse.json({ error: `Submission is already processed (Current status: ${submission.status}).` }, { status: 400 });
    }

    if (action === "approve") {
      console.log(`[APPROVE] Mapping submission ${submissionId} into live BCDB directory...`);

      // Distill data for final insert into master bcdb
      // We remove system/metadata columns from the submission object
      const { 
        id, status, rejection_reason, submitted_at, reviewed_at, reviewed_by, updated_at,
        ...masterData 
      } = submission;

      // 2. Perform Upsert to bcdb table
      const { data: approvedEntry, error: approveError } = await supabase
        .from("bcdb")
        .upsert([{ 
          ...masterData,
          is_deleted: false, // Ensure active
          updated_at: new Date().toISOString()
        }], { onConflict: "email_id" })
        .select("id")
        .single();

      if (approveError) {
        console.error("[APPROVE ERROR] Master insertion failed:", approveError);
        throw new Error(`Insert to Master DB failed: ${approveError.message}`);
      }

      // 3. Update the submission queue status
      const { error: updateStatusError } = await supabase
        .from("bcdb_submissions")
        .update({
          status: "approved",
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", submissionId);

      if (updateStatusError) {
        console.error("[APPROVE ERROR] Queue update failed:", updateStatusError);
      }

      // 4. AUTOMATIC ACCOUNT REGISTRATION UPGRADE
      try {
        if (submission.email_id) {
          const userEmail = submission.email_id.toLowerCase().trim();
          let targetUserId: string | null = null;

          console.log(`[AUTO REG] Initiating shadow account setup for: ${userEmail}`);

          // A. Fetch current user accounts safely using Supabase Admin API
          const { data: listResponse, error: listError } = await supabase.auth.admin.listUsers();
          const users = listResponse?.users || [];
          const existingAuthUser = users.find(u => u.email?.toLowerCase() === userEmail);

          if (existingAuthUser) {
            targetUserId = existingAuthUser.id;
            console.log(`[AUTO REG] Matching Auth account already exists: ${targetUserId}`);
          } else {
            // B. Create clean, confirmed shadow account for first-time Google mapping
            console.log(`[AUTO REG] No existing Auth account found. Provisioning dynamic new record...`);
            const { data: { user: newUser }, error: createError } = await supabase.auth.admin.createUser({
              email: userEmail,
              email_confirm: true,
              user_metadata: {
                full_name: submission.initiated_name || submission.legal_name || "",
                source: "bcdb_approval"
              }
            });

            if (createError) {
              console.error(`[AUTO REG ERROR] Provisioning failed for ${userEmail}:`, createError.message);
            } else if (newUser) {
              targetUserId = newUser.id;
              console.log(`[AUTO REG SUCCESS] Dynamic shadow account provisioned: ${targetUserId}`);
            }
          }

          // C. Deploy the user into application 'profiles' table for operational access rights
          if (targetUserId) {
            console.log(`[AUTO REG] Synchronizing user permissions into 'profiles' for ID: ${targetUserId}`);
            const { error: profileError } = await supabase
              .from("profiles")
              .upsert({
                id: targetUserId,
                email: userEmail,
                full_name: submission.initiated_name || submission.legal_name || "",
                mobile: submission.contact_no || "",
                temple: submission.center || "",
                role: 6, // Active regular user role matching architecture patterns
                updated_at: new Date().toISOString()
              }, { onConflict: 'id' });

            if (profileError) {
              console.error(`[AUTO REG ERROR] Operational permission mapping failed:`, profileError.message);
            } else {
              console.log(`[AUTO REG COMPLETED] Account activated successfully with standard regular privileges.`);
            }
          }
        }
      } catch (regErr: any) {
        // Guard core BCDB transaction from side-effect exceptions
        console.error("[AUTO REG FATAL FAILSAFE]:", regErr);
      }

      return NextResponse.json({ 
        success: true, 
        message: "User approved successfully and record transferred to master database.",
        masterId: approvedEntry.id 
      });
    } 
    
    else if (action === "reject") {
      console.log(`[REJECT] Rejecting submission ${submissionId} with reason: ${reason || "None"}`);

      const { error: updateStatusError } = await supabase
        .from("bcdb_submissions")
        .update({
          status: "rejected",
          rejection_reason: reason || null,
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", submissionId);

      if (updateStatusError) {
        throw updateStatusError;
      }

      return NextResponse.json({ 
        success: true, 
        message: "Registration submission rejected successfully." 
      });
    }

    return NextResponse.json({ error: "Invalid action specified (Accepts: approve, reject)" }, { status: 400 });

  } catch (error: any) {
    console.error("[SUBMISSIONS POST EXCEPTION]:", error);
    return NextResponse.json({ error: error.message || "Internal execution failure." }, { status: 500 });
  }
}
