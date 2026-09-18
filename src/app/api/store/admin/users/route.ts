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

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    if (!(await checkIsAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim().toLowerCase() || "";
    const fetchAllProfiles = searchParams.get('all') === 'true';

    let merged = [];

    if (fetchAllProfiles) {
      // 1. Fetch main DB profiles (For Add User Modal)
      const { data: profiles, error: pError } = await supabaseAdmin!
        .from('profiles')
        .select('id, email, full_name, mobile, temple')
        .order('created_at', { ascending: false });

      if (pError) return NextResponse.json({ error: pError.message }, { status: 500 });

      // Fetch all store_users to map access and edited profile details
      const { data: storeUsers } = await supabaseIdktAdmin!
        .from('store_users')
        .select('id, email, full_name, mobile, temple, store_access_level, is_store_admin');

      const storeUserMap = new Map();
      if (storeUsers) {
        storeUsers.forEach((su: any) => storeUserMap.set(su.id, su));
      }

      merged = (profiles || []).map((p: any) => {
        const su = storeUserMap.get(p.id) || {};
        return {
          id: p.id,
          email: su.email || p.email || "",
          full_name: su.full_name || p.full_name || "N/A",
          mobile: su.mobile || p.mobile || "N/A",
          temple: su.temple || p.temple || "N/A",
          store_access_level: su.store_access_level || 'none',
          is_store_admin: !!su.is_store_admin
        };
      });

    } else {
      // 2. Default flow: Fetch approved users from IDKT DB store_users and merge live mobile & temple from Main DB
      const { data: storeUsers, error: sError } = await supabaseIdktAdmin!
        .from('store_users')
        .select('*');

      if (sError) return NextResponse.json({ error: sError.message }, { status: 500 });

      // Filter approved
      const approvedUsers = (storeUsers || []).filter((su: any) => 
        su.store_access_level === 'general' || 
        su.store_access_level === 'internal' || 
        su.is_store_admin || 
        su.has_special_access
      );

      const approvedIds = approvedUsers.map((su: any) => su.id);
      let profileMap = new Map();
      if (approvedIds.length > 0) {
        const { data: mainProfiles } = await supabaseAdmin!
          .from('profiles')
          .select('id, full_name, mobile, temple')
          .in('id', approvedIds);

        (mainProfiles || []).forEach((p: any) => profileMap.set(p.id, p));
      }

      merged = approvedUsers.map((su: any) => {
        const p = profileMap.get(su.id) || {};
        const getValidVal = (val1: string, val2: string) => {
          if (val1 && val1.trim() !== "" && val1.trim().toUpperCase() !== "N/A") return val1.trim();
          if (val2 && val2.trim() !== "" && val2.trim().toUpperCase() !== "N/A") return val2.trim();
          return "N/A";
        };

        return {
          id: su.id,
          email: su.email || p.email || "",
          full_name: getValidVal(su.full_name, p.full_name),
          mobile: getValidVal(su.mobile, p.mobile),
          temple: getValidVal(su.temple, p.temple),
          kurta_size: su.kurta_size || "-",
          chappal_size: su.chappal_size || "-",
          color_preference: su.color_preference || "-",
          sarvadhan_access_requested: !!su.sarvadhan_access_requested,
          store_access_level: su.store_access_level || (su.has_special_access ? 'internal' : 'none'),
          has_special_access: !!su.has_special_access, // legacy
          is_store_admin: !!su.is_store_admin,
          is_bcdb_user: !!su.is_bcdb_user
        };
      });
    }

    // Apply search filter if provided
    if (search) {
      merged = merged.filter((u: any) => 
        (u.email || "").toLowerCase().includes(search) ||
        (u.full_name || "").toLowerCase().includes(search) ||
        (u.mobile || "").toLowerCase().includes(search) ||
        (u.temple || "").toLowerCase().includes(search)
      );
    }

    return NextResponse.json(merged);
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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

    const body = await request.json();
    const { 
      id, 
      email, 
      full_name, 
      mobile, 
      temple, 
      kurta_size, 
      chappal_size, 
      color_preference, 
      store_access_level, 
      is_store_admin 
    } = body;

    if (!id) return NextResponse.json({ error: "Missing user ID" }, { status: 400 });

    const upsertData: any = { id };
    if (email !== undefined) upsertData.email = email;
    if (full_name !== undefined) upsertData.full_name = full_name;
    if (mobile !== undefined) upsertData.mobile = mobile;
    if (temple !== undefined) upsertData.temple = temple;
    if (kurta_size !== undefined) upsertData.kurta_size = kurta_size;
    if (chappal_size !== undefined) upsertData.chappal_size = chappal_size;
    if (color_preference !== undefined) upsertData.color_preference = color_preference;
    if (store_access_level !== undefined) upsertData.store_access_level = store_access_level;
    if (typeof is_store_admin === 'boolean') {
      upsertData.is_store_admin = is_store_admin;
      if (is_store_admin && (!store_access_level || store_access_level === 'none')) {
        upsertData.store_access_level = 'internal';
        upsertData.has_special_access = true;
      }
    }

    // Legacy sync
    if (store_access_level === 'internal' || store_access_level === 'general') {
       upsertData.has_special_access = true;
    } else if (store_access_level === 'none' && !upsertData.is_store_admin) {
       upsertData.has_special_access = false;
    }

    const { data, error } = await supabaseIdktAdmin!
      .from('store_users')
      .upsert(upsertData)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
