import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';
import { getUserFromToken } from '@/lib/auth-utils';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    
    // Decode JWT locally
    const user = getUserFromToken(request);
    if (!user || !user.id || !user.email) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Verify user is super admin
    const { data: profile } = await supabaseAdmin!
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 1) {
      return NextResponse.json({ error: "Unauthorized. Super Admin only." }, { status: 403 });
    }

    if (!supabaseIdktAdmin) {
      return NextResponse.json({ error: "IDKT DB not configured" }, { status: 500 });
    }

    // 1. Fetch all profiles from Main DB
    const { data: allProfiles, error: profilesErr } = await supabaseAdmin!
      .from('profiles')
      .select('id, email, full_name');

    if (profilesErr || !allProfiles) {
      console.error("Error fetching profiles:", profilesErr);
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // 2. Fetch all BCDB emails
    const { data: bcdbRecords, error: bcdbErr } = await supabaseAdmin!
      .from('bcdb')
      .select('email_id');

    if (bcdbErr || !bcdbRecords) {
      console.error("Error fetching bcdb:", bcdbErr);
      return NextResponse.json({ error: "Failed to fetch bcdb records" }, { status: 500 });
    }

    // 3. Create a set of lowercased bcdb emails for fast lookup
    const bcdbEmails = new Set(bcdbRecords.map(r => r.email_id?.toLowerCase().trim()).filter(Boolean));

    // 4. Prepare bulk upsert payload
    const upsertPayload = allProfiles.filter(p => p.email).map(p => {
      const isBcdbUser = bcdbEmails.has(p.email.toLowerCase().trim());
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name || '',
        is_bcdb_user: isBcdbUser
      };
    });

    // 5. Perform bulk upsert to IDKT DB
    // Supabase JS .upsert() by default merges updates if conflict occurs on primary key (id).
    // We only want to update is_bcdb_user, email, full_name if they differ, without losing other data.
    // However, basic upsert might overwrite missing fields to defaults if we don't specify them.
    // Since we don't have all store_user fields in the payload, we must use ignoreDuplicates 
    // or upsert and handle conflict. Actually, the easiest way is to loop and upsert, or update if exists.
    
    // To prevent overwriting `has_special_access` and other preferences with defaults, 
    // we should do this carefully. Since Supabase upsert requires all columns or defaults them,
    // let's fetch existing store_users first.
    const { data: existingStoreUsers } = await supabaseIdktAdmin!
      .from('store_users')
      .select('id');
      
    const existingIds = new Set(existingStoreUsers?.map(u => u.id) || []);
    
    const toInsert = upsertPayload.filter(p => !existingIds.has(p.id));
    const toUpdate = upsertPayload.filter(p => existingIds.has(p.id));

    let insertedCount = 0;
    let updatedCount = 0;

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabaseIdktAdmin!
        .from('store_users')
        .insert(toInsert);
      if (insertErr) {
        console.error("Bulk insert error:", insertErr);
      } else {
        insertedCount = toInsert.length;
      }
    }

    // Update existing ones (we must do this to update the is_bcdb_user flag for existing users)
    // Supabase allows bulk upsert where only specified columns are updated if we use upsert 
    // and specify the conflict columns.
    if (toUpdate.length > 0) {
       const { error: updateErr } = await supabaseIdktAdmin!
        .from('store_users')
        .upsert(toUpdate, { onConflict: 'id' });
       if (updateErr) {
         console.error("Bulk update error:", updateErr);
       } else {
         updatedCount = toUpdate.length;
       }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Sync complete. Inserted: ${insertedCount}, Updated: ${updatedCount}`,
      inserted: insertedCount,
      updated: updatedCount
    });

  } catch (error: any) {
    console.error("Error in /api/admin/store-sync:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
