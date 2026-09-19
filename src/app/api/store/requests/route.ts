import { NextResponse } from 'next/server';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth-utils';
import { getVariantCost } from '@/lib/store-variant-utils';

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
    const token = authHeader.replace("Bearer ", "");
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    if (!supabaseIdktAdmin) return NextResponse.json({ error: "IDKT DB not configured" }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode'); // 'all', 'pending', 'approved', 'mine'

    let query = supabaseIdktAdmin!
      .from('store_requests')
      .select(`
        id, user_id, item_id, quantity, selected_variant, status, created_at,
        store_items (item_code, item_name, cost, variants),
        store_users (full_name, email, temple, store_access_level)
      `)
      .order('created_at', { ascending: false });

    if (mode === 'mine') {
      query = query.eq('user_id', user.id);
    } else {
      // Must be admin to query all/pending/approved
      if (!(await checkIsAdmin(user.id))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (mode === 'pending') query = query.eq('status', 'pending').order('created_at', { ascending: true });
      if (mode === 'approved') query = query.eq('status', 'approved');
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
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
    
    if (!supabaseIdktAdmin) return NextResponse.json({ error: "IDKT DB not configured" }, { status: 500 });

    const body = await request.json();
    const { item_id, quantity, selected_variant, target_user_id, is_guest, guest_name, guest_temple, guest_mobile, request_date } = body;

    let requestUserId = user.id;

    // Check admin permissions if submitting for another user or a guest
    if (target_user_id || is_guest) {
      const isAdmin = await checkIsAdmin(user.id);
      if (!isAdmin) {
        return NextResponse.json({ error: "Only admins can create requests for other users" }, { status: 403 });
      }

      if (is_guest && guest_name) {
        // Create/upsert a guest user record in store_users
        const guestId = crypto.randomUUID();
        const guestEmail = `${guest_name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString().slice(-4)}@guest.local`;
        
        const { data: newGuest, error: guestErr } = await supabaseIdktAdmin!
          .from('store_users')
          .insert({
            id: guestId,
            full_name: `${guest_name} (Guest)`,
            email: guestEmail,
            temple: guest_temple || "Guest Temple",
            mobile: guest_mobile || "N/A",
            store_access_level: 'internal'
          })
          .select()
          .single();

        if (guestErr) {
          console.error("Error creating guest user:", guestErr);
          return NextResponse.json({ error: "Failed to create guest user record" }, { status: 500 });
        }

        requestUserId = guestId;
      } else if (target_user_id) {
        requestUserId = target_user_id;
      }
    }

    // Look up store item for snapshotting name and price
    const { data: storeItem } = await supabaseIdktAdmin!
      .from('store_items')
      .select('item_code, item_name, cost, variants')
      .eq('id', item_id)
      .maybeSingle();

    const rawVariant = selected_variant || "";
    let cleanVar = rawVariant;
    let approvedBy = undefined;
    let source = target_user_id ? "Added by Manager" : (is_guest ? "Guest Entry" : "Self Request");

    if (typeof rawVariant === "string" && rawVariant.startsWith('{') && rawVariant.endsWith('}')) {
      try {
        const parsed = JSON.parse(rawVariant);
        if (parsed && typeof parsed === "object") {
          cleanVar = parsed.variant !== undefined ? parsed.variant : (parsed.label !== undefined ? parsed.label : rawVariant);
          if (parsed.approved_by || parsed.approvedBy) approvedBy = parsed.approved_by || parsed.approvedBy;
          if (parsed.source) source = parsed.source;
        }
      } catch (e) {}
    }

    const unitCost = storeItem ? getVariantCost(cleanVar, storeItem.variants, Number(storeItem.cost) || 0) : 0;

    const variantPayload = JSON.stringify({
      variant: cleanVar,
      snapshot_item_name: storeItem?.item_name || "Item",
      snapshot_item_code: storeItem?.item_code || "",
      snapshot_cost: unitCost,
      approved_by: approvedBy,
      source: source
    });

    const insertPayload: any = {
      user_id: requestUserId,
      item_id,
      quantity: Number(quantity) || 1,
      selected_variant: variantPayload,
      status: 'pending'
    };

    if (request_date) {
      const parsedDate = new Date(request_date);
      if (!isNaN(parsedDate.getTime())) {
        const now = new Date();
        parsedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
        insertPayload.created_at = parsedDate.toISOString();
      }
    }

    const { data, error } = await supabaseIdktAdmin!
      .from('store_requests')
      .insert(insertPayload)
      .select(`
        *,
        store_items (item_code, item_name, cost, variants),
        store_users (full_name, email, temple, store_access_level)
      `)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Error creating store request:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    if (!(await checkIsAdmin(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, quantity, selected_variant, item_id } = body;

    if (!id) return NextResponse.json({ error: "Missing request ID" }, { status: 400 });

    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (status) updatePayload.status = status;
    if (quantity !== undefined) updatePayload.quantity = Number(quantity);
    if (item_id) updatePayload.item_id = item_id;

    if (status === 'approved' || selected_variant !== undefined) {
      let payloadObj: any = {};
      let cleanVar = selected_variant || "";
      if (typeof selected_variant === "string" && selected_variant.startsWith('{') && selected_variant.endsWith('}')) {
        try {
          payloadObj = JSON.parse(selected_variant);
          cleanVar = payloadObj.variant !== undefined ? payloadObj.variant : selected_variant;
        } catch (e) {}
      } else if (typeof selected_variant === "object" && selected_variant !== null) {
        payloadObj = selected_variant;
        cleanVar = payloadObj.variant || "";
      }

      // Snapshot current store item name, item code, and variant cost at the exact moment of approval
      const targetReqId = id;
      const { data: existingReq } = await supabaseIdktAdmin!
        .from('store_requests')
        .select('item_id, selected_variant, store_items (item_code, item_name, cost, variants)')
        .eq('id', targetReqId)
        .maybeSingle();

      const sItem = (existingReq as any)?.store_items;
      if (sItem) {
        payloadObj.snapshot_item_name = sItem.item_name;
        payloadObj.snapshot_item_code = sItem.item_code;
        payloadObj.snapshot_cost = getVariantCost(cleanVar, sItem.variants, Number(sItem.cost) || 0);
      }

      payloadObj.variant = cleanVar;
      updatePayload.selected_variant = JSON.stringify(payloadObj);
    }

    const { data, error } = await supabaseIdktAdmin!
      .from('store_requests')
      .update(updatePayload)
      .eq('id', id)
      .select(`
        *,
        store_items (item_code, item_name, cost, variants),
        store_users (full_name, email, temple, store_access_level)
      `)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    // Ensure they own it or are admin
    const isAdmin = await checkIsAdmin(user.id);
    
    let query = supabaseIdktAdmin!.from('store_requests').delete().eq('id', id);
    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
