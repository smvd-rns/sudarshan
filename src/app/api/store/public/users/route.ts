import { NextResponse } from 'next/server';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    if (!supabaseIdktAdmin) {
      return NextResponse.json({ error: "DB not configured" }, { status: 500 });
    }

    // Fetch approved store users from store_users
    const { data: storeUsers, error: sError } = await supabaseIdktAdmin
      .from('store_users')
      .select('id, full_name, store_access_level, is_store_admin, has_special_access');

    if (sError) {
      return NextResponse.json({ error: sError.message }, { status: 500 });
    }

    // Filter only store-approved users
    const approvedStoreUsers = (storeUsers || []).filter((su: any) => 
      su.store_access_level === 'general' || 
      su.store_access_level === 'internal' || 
      su.is_store_admin || 
      su.has_special_access
    );

    const approvedIds = approvedStoreUsers.map((su: any) => su.id);

    // Merge names from main DB profiles if full_name is missing or placeholder
    let nameMap = new Map<string, string>();
    if (approvedIds.length > 0 && supabaseAdmin) {
      const { data: mainProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', approvedIds);

      if (mainProfiles) {
        mainProfiles.forEach((p: any) => {
          if (p.full_name && p.full_name.trim()) {
            nameMap.set(p.id, p.full_name.trim());
          }
        });
      }
    }

    // Construct response containing ONLY id and full_name (no emails or sensitive details)
    const result = approvedStoreUsers
      .map((su: any) => {
        const nameFromProfile = nameMap.get(su.id);
        const name = (nameFromProfile || su.full_name || "Approved Member").trim();
        return {
          id: su.id,
          full_name: name
        };
      })
      .filter((u: any) => u.full_name && u.full_name !== "N/A")
      .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Error fetching public approved users:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
