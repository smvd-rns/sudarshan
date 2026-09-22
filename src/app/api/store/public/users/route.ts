import { NextResponse } from 'next/server';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';

export async function GET() {
  try {
    if (!supabaseIdktAdmin) {
      return NextResponse.json({ error: "DB not configured" }, { status: 500 });
    }

    // Fetch approved store users strictly from store_users table in Store DB
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

    // Construct response containing ONLY id and full_name directly from store_users table
    const result = approvedStoreUsers
      .map((su: any) => {
        const name = (su.full_name || "Approved Member").trim();
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

