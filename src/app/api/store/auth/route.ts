import { NextResponse } from 'next/server';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth-utils';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });

    const user = getUserFromToken(request);
    if (!user || !user.id || !user.email) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!supabaseIdktAdmin) {
      return NextResponse.json({ error: "IDKT DB not configured" }, { status: 500 });
    }

    // Fetch profile, bcdb record, and store_users in parallel for speed
    const [profileRes, bcdbRes, storeUserRes] = await Promise.all([
      supabaseAdmin!
        .from('profiles')
        .select('email, full_name, mobile, temple, role, roles')
        .eq('id', user.id)
        .maybeSingle(),
      supabaseAdmin!
        .from('bcdb')
        .select('id')
        .ilike('email_id', user.email)
        .maybeSingle(),
      supabaseIdktAdmin!
        .from('store_users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
    ]);

    const profile = profileRes.data;
    const bcdbRecord = bcdbRes.data;
    const storeUser = storeUserRes.data;
    const storeUserErr = storeUserRes.error;

    const rawRoles = Array.isArray(profile?.roles) 
      ? profile.roles 
      : [profile?.role].filter((r: any) => r != null);

    const uRoles = rawRoles.map((r: any) => Number(r)).filter((r: any) => !isNaN(r));
    const isStoreAdminRole = uRoles.includes(1) || uRoles.includes(8);
    const isStoreManagerRole = uRoles.includes(9);
    const hasAnyStoreAdminAccess = isStoreAdminRole || isStoreManagerRole;

    const isBcdb = !!bcdbRecord;

    const defaultAccessLevel = (isBcdb || hasAnyStoreAdminAccess) ? 'internal' : 'none';
    const isStoreAdmin = hasAnyStoreAdminAccess;

    if (storeUserErr) {
      console.error("Error fetching store_user:", storeUserErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (storeUser) {
      const isAssignedStoreAdmin = !!storeUser.is_store_admin;
      const effectiveHasAdminAccess = isStoreAdminRole || isStoreManagerRole || isAssignedStoreAdmin;

      const needsSync = storeUser.mobile !== profile?.mobile || storeUser.temple !== profile?.temple || storeUser.full_name !== profile?.full_name;
      const shouldUpgradeAccess = (isBcdb || effectiveHasAdminAccess) && (storeUser.store_access_level === 'none' && !storeUser.has_special_access);
      const shouldUpgradeAdmin = (isStoreAdminRole || isStoreManagerRole) && !storeUser.is_store_admin;

      if (needsSync || shouldUpgradeAccess || shouldUpgradeAdmin) {
         const updatePayload: any = {};
         if (profile?.full_name) updatePayload.full_name = profile.full_name;
         if (profile?.mobile) updatePayload.mobile = profile.mobile;
         if (profile?.temple) updatePayload.temple = profile.temple;
         if (shouldUpgradeAccess || (effectiveHasAdminAccess && storeUser.store_access_level === 'none')) {
           updatePayload.store_access_level = 'internal';
           updatePayload.is_bcdb_user = isBcdb;
         }
         if (shouldUpgradeAdmin) {
           updatePayload.is_store_admin = true;
         }
         updatePayload.updated_at = new Date().toISOString();

         let { data: updatedUser, error: updateErr } = await supabaseIdktAdmin!
           .from('store_users')
           .update(updatePayload)
           .eq('id', user.id)
           .select('*')
           .single();

         // Fallback if mobile/temple column missing in store_users Postgres table
         if (updateErr && (updateErr.code === 'PGRST204' || updateErr.message?.includes('mobile') || updateErr.message?.includes('temple'))) {
           delete updatePayload.mobile;
           delete updatePayload.temple;
           const fallbackRes = await supabaseIdktAdmin!
             .from('store_users')
             .update(updatePayload)
             .eq('id', user.id)
             .select('*')
             .single();
           updatedUser = fallbackRes.data;
         }

         const mergedUser = updatedUser || { ...storeUser, ...updatePayload };
         const finalIsStoreAdmin = !!mergedUser.is_store_admin || isStoreAdminRole || isStoreManagerRole;

         const effectiveUser = {
           ...mergedUser,
           mobile: profile?.mobile || storeUser.mobile || "N/A",
           temple: profile?.temple || storeUser.temple || "N/A",
           is_store_admin: finalIsStoreAdmin,
           is_super_or_store_admin: isStoreAdminRole,
           is_store_manager: isStoreManagerRole || (finalIsStoreAdmin && !isStoreAdminRole),
           can_access_approvals: finalIsStoreAdmin,
           can_access_admin_panel: isStoreAdminRole
         };
         const hasAccess = effectiveHasAdminAccess || (effectiveUser?.store_access_level === 'general' || effectiveUser?.store_access_level === 'internal' || effectiveUser?.is_store_admin || effectiveUser?.has_special_access);
         return NextResponse.json({ storeUser: effectiveUser, access: hasAccess });
      }

      const finalIsStoreAdmin = !!storeUser.is_store_admin || isStoreAdminRole || isStoreManagerRole;
      const effectiveUser = {
        ...storeUser,
        mobile: storeUser.mobile || profile?.mobile || "N/A",
        temple: storeUser.temple || profile?.temple || "N/A",
        is_store_admin: finalIsStoreAdmin,
        is_super_or_store_admin: isStoreAdminRole,
        is_store_manager: isStoreManagerRole || (finalIsStoreAdmin && !isStoreAdminRole),
        can_access_approvals: finalIsStoreAdmin,
        can_access_admin_panel: isStoreAdminRole
      };
      const hasAccess = effectiveHasAdminAccess || (storeUser.store_access_level === 'general' || storeUser.store_access_level === 'internal' || storeUser.is_store_admin || storeUser.has_special_access);
      return NextResponse.json({ storeUser: effectiveUser, access: hasAccess });
    }

    // Auto-create for new visitor
    const isNewUserStoreAdmin = isStoreAdminRole || isStoreManagerRole;
    const newStoreUserPayload: any = {
      id: user.id,
      email: profile?.email || user.email,
      full_name: profile?.full_name || '',
      mobile: profile?.mobile || "N/A",
      temple: profile?.temple || "N/A",
      is_bcdb_user: isBcdb,
      store_access_level: defaultAccessLevel,
      has_special_access: hasAnyStoreAdminAccess,
      is_store_admin: isNewUserStoreAdmin
    };
    
    let { data: createdStoreUser, error: insertErr } = await supabaseIdktAdmin!
      .from('store_users')
      .insert(newStoreUserPayload)
      .select('*')
      .single();

    if (insertErr && (insertErr.code === 'PGRST204' || insertErr.message?.includes('mobile') || insertErr.message?.includes('temple'))) {
      delete newStoreUserPayload.mobile;
      delete newStoreUserPayload.temple;
      const fallbackInsert = await supabaseIdktAdmin!
        .from('store_users')
        .insert(newStoreUserPayload)
        .select('*')
        .single();
      createdStoreUser = fallbackInsert.data;
    }

    const finalIsStoreAdmin = !!createdStoreUser?.is_store_admin || isNewUserStoreAdmin;
    const finalUser = {
      ...(createdStoreUser || newStoreUserPayload),
      mobile: profile?.mobile || "N/A",
      temple: profile?.temple || "N/A",
      is_store_admin: finalIsStoreAdmin,
      is_super_or_store_admin: isStoreAdminRole,
      is_store_manager: isStoreManagerRole || (finalIsStoreAdmin && !isStoreAdminRole),
      can_access_approvals: finalIsStoreAdmin,
      can_access_admin_panel: isStoreAdminRole
    };

    return NextResponse.json({ storeUser: finalUser, access: true });

  } catch (error: any) {
    console.error("Error in /api/store/auth:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
