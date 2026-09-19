import { NextResponse } from 'next/server';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth-utils';
import { logStoreActivity } from '@/lib/store-logger';

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

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');

    let query = supabaseIdktAdmin!
      .from('store_reimbursements')
      .select(`
        id, user_id, entry_date, item_details, amount, created_at,
        store_users (full_name, email, mobile, temple)
      `);

    if (mode === 'mine') {
      query = query.eq('user_id', user.id);
    } else {
      if (!(await checkIsAdmin(user.id))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { data: records, error } = await query
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('store_reimbursements')) {
        return NextResponse.json({ 
          error: "Table store_reimbursements not found. Please create the table in Supabase SQL Editor.",
          tableMissing: true 
        }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(records || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
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
    const { user_id, date, item_details, amount } = body;

    if (!user_id || !item_details || amount === undefined || amount === null) {
      return NextResponse.json({ error: "Missing required fields: user_id, item_details, amount" }, { status: 400 });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const entryDate = date ? date : new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseIdktAdmin!
      .from('store_reimbursements')
      .insert({
        user_id,
        entry_date: entryDate,
        item_details: item_details.trim(),
        amount: numAmount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select(`
        id, user_id, entry_date, item_details, amount, created_at,
        store_users (full_name, email, mobile, temple)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('store_reimbursements')) {
        return NextResponse.json({ 
          error: "Table 'store_reimbursements' does not exist in IDKT Supabase DB yet. Please execute the SQL creation script first.",
          tableMissing: true 
        }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logStoreActivity({
      user_id: user.id,
      user_name: (user as any).user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'Admin'),
      user_email: user.email || '',
      action: 'REIMBURSEMENT_ADDED',
      details: `Added reimbursement of ₹${numAmount} for "${item_details}" (User: ${(data as any)?.store_users?.full_name || user_id}).`,
      metadata: { reimbursement_id: data?.id, target_user_id: user_id, amount: numAmount, item_details }
    });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    if (!(await checkIsAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const { error } = await supabaseIdktAdmin!
      .from('store_reimbursements')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logStoreActivity({
      user_id: user.id,
      user_name: (user as any).user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'Admin'),
      user_email: user.email || '',
      action: 'REIMBURSEMENT_DELETED',
      details: `Deleted reimbursement record ID: ${id}.`,
      metadata: { reimbursement_id: id }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
