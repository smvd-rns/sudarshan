import { NextResponse } from 'next/server';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth-utils';

async function checkIsAdmin(userId: string) {
  const { data: storeUser } = await supabaseIdktAdmin!
    .from('store_users')
    .select('is_store_admin')
    .eq('id', userId)
    .maybeSingle();

  if (storeUser?.is_store_admin) return true;

  const { data: profile } = await supabaseAdmin!
    .from('profiles')
    .select('role, roles')
    .eq('id', userId)
    .maybeSingle();

  const rawRoles = Array.isArray(profile?.roles) 
    ? profile.roles 
    : [profile?.role].filter((r: any) => r != null);

  const uRoles = rawRoles.map((r: any) => Number(r)).filter((r: any) => !isNaN(r));

  // Access allowed for Super Admin (1), Store Admin (8), and Store Manager (9)
  return uRoles.includes(1) || uRoles.includes(8) || uRoles.includes(9);
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    if (!(await checkIsAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!supabaseIdktAdmin || !supabaseAdmin) {
      return NextResponse.json({ error: "Database client not configured" }, { status: 500 });
    }

    let resetMode = false;
    try {
      const body = await request.json();
      if (body && body.reset) resetMode = true;
    } catch (e) {
      // Body empty or optional
    }

    // If reset mode requested, delete existing records from store_users
    if (resetMode) {
      await supabaseIdktAdmin
        .from('store_users')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    }

    // 1. Fetch ALL profiles from Main DB
    const { data: allProfiles, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, mobile, temple, role, roles');

    if (pErr || !allProfiles) {
      return NextResponse.json({ error: pErr?.message || "Failed to fetch profiles from Main DB" }, { status: 500 });
    }

    // 2. Fetch ALL BCDB emails from Main DB
    const { data: bcdbRecords } = await supabaseAdmin
      .from('bcdb')
      .select('email_id');

    const bcdbEmails = new Set((bcdbRecords || []).map(b => (b.email_id || "").toLowerCase().trim()).filter(Boolean));

    // 3. Fetch existing store_users (if not reset) to preserve access settings
    let existingMap = new Map();
    if (!resetMode) {
      const { data: existingStoreUsers } = await supabaseIdktAdmin
        .from('store_users')
        .select('*');

      (existingStoreUsers || []).forEach(su => existingMap.set(su.id, su));
    }

    // 4. Build bulk upsert payload array
    const fullPayload: any[] = [];
    for (const p of allProfiles) {
      if (!p.id || !p.email) continue;

      const su = existingMap.get(p.id) || {};

      const pMobile = su.mobile || p.mobile || "N/A";
      const pTemple = su.temple || p.temple || "N/A";
      const pName = su.full_name || p.full_name || "";
      const pEmail = su.email || p.email || "";
      
      const isBcdb = bcdbEmails.has(pEmail.toLowerCase().trim());
      
      const rawRoles = Array.isArray(p.roles) ? p.roles : [p.role].filter((r: any) => r != null);
      const uRoles = rawRoles.map((r: any) => Number(r)).filter((r: any) => !isNaN(r));
      const hasAnyStoreAdminAccess = uRoles.includes(1) || uRoles.includes(8) || uRoles.includes(9);

      const defaultAccessLevel = (isBcdb || hasAnyStoreAdminAccess) ? 'internal' : 'none';
      const accessLevel = su.store_access_level || defaultAccessLevel;
      const isAdminRole = typeof su.is_store_admin === 'boolean' ? (su.is_store_admin || hasAnyStoreAdminAccess) : hasAnyStoreAdminAccess;

      fullPayload.push({
        id: p.id,
        email: pEmail,
        full_name: pName,
        mobile: pMobile,
        temple: pTemple,
        is_bcdb_user: isBcdb,
        store_access_level: accessLevel,
        is_store_admin: isAdminRole,
        updated_at: new Date().toISOString()
      });
    }

    if (fullPayload.length === 0) {
      return NextResponse.json({ message: "No valid user profiles found in Main DB.", updatedCount: 0 });
    }

    // 5. Perform fast bulk upserts in batches of 100
    const BATCH_SIZE = 100;
    let syncedCount = 0;
    let columnMissingDetected = false;

    for (let i = 0; i < fullPayload.length; i += BATCH_SIZE) {
      const batch = fullPayload.slice(i, i + BATCH_SIZE);
      
      let { error: uErr } = await supabaseIdktAdmin
        .from('store_users')
        .upsert(batch, { onConflict: 'id' });

      // Fallback if mobile or temple columns do not exist in IDKT DB Postgres schema yet
      if (uErr && (uErr.code === 'PGRST204' || uErr.message?.includes('mobile') || uErr.message?.includes('temple'))) {
        columnMissingDetected = true;
        const strippedBatch = batch.map(({ mobile, temple, ...rest }) => rest);
        const { error: fallbackErr } = await supabaseIdktAdmin
          .from('store_users')
          .upsert(strippedBatch, { onConflict: 'id' });
        
        if (!fallbackErr) {
          syncedCount += batch.length;
        } else {
          return NextResponse.json({ error: `Fallback Upsert Failed: ${fallbackErr.message} (Code: ${fallbackErr.code})` }, { status: 500 });
        }
      } else if (uErr) {
        return NextResponse.json({ error: `Upsert Failed: ${uErr.message} (Code: ${uErr.code})` }, { status: 500 });
      } else {
        syncedCount += batch.length;
      }
    }

    let noteMessage = "";
    if (columnMissingDetected) {
      noteMessage = "\n\nNotice: To store mobile & temple directly in the IDKT store_users table, please run in SQL Editor:\nALTER TABLE store_users ADD COLUMN IF NOT EXISTS mobile TEXT;\nALTER TABLE store_users ADD COLUMN IF NOT EXISTS temple TEXT;";
    }

    return NextResponse.json({ 
      success: true, 
      message: `${resetMode ? 'Fresh Sync' : 'Fast Bulk Sync'} complete! Synced ${syncedCount} user profile(s) from Main DB in high-speed batches.${noteMessage}`, 
      updatedCount: syncedCount 
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
