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
  if (!supabaseIdktAdmin) return NextResponse.json({ error: "IDKT DB not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const includeUnavailable = searchParams.get('all') === 'true';

  let query = supabaseIdktAdmin!
    .from('store_items')
    .select('*')
    .order('item_code', { ascending: true });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });

  let result = data || [];

  // Filter out items where is_available is explicitly false for non-admin public requests
  if (!includeUnavailable) {
    result = result.filter((item: any) => item.is_available !== false);
  }

  // Attempt to check access level based on token
  try {
    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      const user = getUserFromToken(request);
      if (user && user.id) {
        const { data: storeUser } = await supabaseIdktAdmin!
          .from('store_users')
          .select('store_access_level, is_store_admin, has_special_access')
          .eq('id', user.id)
          .maybeSingle();
        
        if (storeUser && !storeUser.is_store_admin) {
          const accessLevel = storeUser.store_access_level || (storeUser.has_special_access ? 'internal' : 'none');
          if (accessLevel === 'general') {
             // General access only sees General items
             result = result.filter((item: any) => item.category === 'General');
          } else if (accessLevel === 'none') {
             result = [];
          }
        }
      } else {
        // No valid user token, return empty unless includeUnavailable which implies admin route
        if (!includeUnavailable) result = [];
      }
    } else {
       if (!includeUnavailable) result = [];
    }
  } catch (err) {
    // If auth fails, default to restricted
    if (!includeUnavailable) result = [];
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    if (!(await checkIsAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    let { item_code, item_name, category, cost, variants, is_available } = body;

    // Auto-allocate 3-digit sequential item code if not provided or set to 'auto'
    if (!item_code || item_code === 'auto') {
      const { data: allItems } = await supabaseIdktAdmin!
        .from('store_items')
        .select('item_code');
      
      let maxNum = 0;
      if (allItems && Array.isArray(allItems)) {
        allItems.forEach(i => {
          if (i.item_code) {
            const match = i.item_code.match(/\d+/);
            if (match) {
              const num = parseInt(match[0], 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
            }
          }
        });
      }
      item_code = String(maxNum + 1).padStart(3, '0');
    }

    const insertPayload: any = {
      item_code,
      item_name,
      category,
      cost,
      variants,
      is_available: typeof is_available === 'boolean' ? is_available : true
    };

    let { data, error } = await supabaseIdktAdmin!
      .from('store_items')
      .insert(insertPayload)
      .select()
      .single();

    // Fallback if is_available column is not yet in DB table schema
    if (error && error.code === 'PGRST204') {
      delete insertPayload.is_available;
      const fallbackRes = await supabaseIdktAdmin!
        .from('store_items')
        .insert(insertPayload)
        .select()
        .single();
      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logStoreActivity({
      user_id: user.id,
      user_name: (user as any).user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'Admin'),
      user_email: user.email || '',
      action: 'ITEM_CREATED',
      details: `Created store item "${data?.item_name || item_name}" (Code: ${item_code}, Price: ₹${cost}).`,
      metadata: { item_id: data?.id, item_code, item_name, cost, category }
    });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    if (!(await checkIsAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, item_code, item_name, category, cost, variants, is_available } = body;

    if (!id) return NextResponse.json({ error: "Missing item ID" }, { status: 400 });

    const updatePayload: any = {
      item_code,
      item_name,
      category,
      cost,
      variants,
      is_available: typeof is_available === 'boolean' ? is_available : true,
      updated_at: new Date().toISOString()
    };

    let { data, error } = await supabaseIdktAdmin!
      .from('store_items')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    // Fallback if is_available column is not yet created in DB schema
    if (error && error.code === 'PGRST204') {
      delete updatePayload.is_available;
      const fallbackRes = await supabaseIdktAdmin!
        .from('store_items')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logStoreActivity({
      user_id: user.id,
      user_name: (user as any).user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'Admin'),
      user_email: user.email || '',
      action: 'ITEM_UPDATED',
      details: `Updated store item "${data?.item_name || item_name}" (Code: ${item_code}, Price: ₹${cost}).`,
      metadata: { item_id: id, item_code, item_name, cost, category }
    });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    if (!(await checkIsAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const { error } = await supabaseIdktAdmin!
      .from('store_items')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logStoreActivity({
      user_id: user.id,
      user_name: (user as any).user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'Admin'),
      user_email: user.email || '',
      action: 'ITEM_DELETED',
      details: `Deleted store item ID: ${id}.`,
      metadata: { item_id: id }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
