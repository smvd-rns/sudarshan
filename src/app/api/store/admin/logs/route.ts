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

    if (!supabaseIdktAdmin) {
      return NextResponse.json({ error: "DB not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const search = searchParams.get('search');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let query = supabaseIdktAdmin
      .from('store_activity_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (action && action !== 'all') {
      query = query.eq('action', action);
    }

    if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00.000Z`);
    }

    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
    }

    const { data, error } = await query;

    if (error) {
      // If store_activity_logs table does not exist yet in Postgres DB, return empty list gracefully
      if (error.code === '42P01') {
        return NextResponse.json([]);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let resultList = data || [];

    // Pre-fetch store_users & profiles to resolve actual user names for logs that stored email
    const { data: storeUsers } = await supabaseIdktAdmin
      .from('store_users')
      .select('id, full_name, email');

    const storeUserById = new Map((storeUsers || []).map(u => [u.id, u.full_name]));
    const storeUserByEmail = new Map((storeUsers || []).filter(u => u.email).map(u => [u.email.toLowerCase(), u.full_name]));

    let profileById = new Map<string, string>();
    let profileByEmail = new Map<string, string>();
    if (supabaseAdmin) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email');
      profileById = new Map((profiles || []).map(p => [p.id, p.full_name]));
      profileByEmail = new Map((profiles || []).filter(p => p.email).map(p => [(p.email || "").toLowerCase(), p.full_name]));
    }

    resultList = resultList.map((log: any) => {
      let rName = log.user_name;
      let rEmail = log.user_email || "";

      if (rName && rName.includes('@')) {
        if (!rEmail) rEmail = rName;
      }

      if (!rName || rName.includes('@') || rName === 'Admin' || rName === 'User/Admin') {
        if (log.user_id && storeUserById.has(log.user_id)) {
          rName = storeUserById.get(log.user_id);
        } else if (rEmail && storeUserByEmail.has(rEmail.toLowerCase())) {
          rName = storeUserByEmail.get(rEmail.toLowerCase());
        } else if (log.user_id && profileById.has(log.user_id)) {
          rName = profileById.get(log.user_id);
        } else if (rEmail && profileByEmail.has(rEmail.toLowerCase())) {
          rName = profileByEmail.get(rEmail.toLowerCase());
        }
      }

      return {
        ...log,
        user_name: rName || (rEmail ? rEmail.split('@')[0] : 'User'),
        user_email: rEmail
      };
    });

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      resultList = resultList.filter((log: any) => {
        return (
          (log.user_name || "").toLowerCase().includes(q) ||
          (log.user_email || "").toLowerCase().includes(q) ||
          (log.action || "").toLowerCase().includes(q) ||
          (log.details || "").toLowerCase().includes(q)
        );
      });
    }

    return NextResponse.json(resultList);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
