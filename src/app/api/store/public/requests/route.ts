import { NextResponse } from 'next/server';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';
import { logStoreActivity } from '@/lib/store-logger';

export async function POST(request: Request) {
  try {
    if (!supabaseIdktAdmin) {
      return NextResponse.json({ error: "DB not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { user_id, items } = body;

    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json({ error: "Please select your name from the approved list" }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Please select at least one item to request" }, { status: 400 });
    }

    // Verify user is an approved store user
    const { data: storeUser, error: uErr } = await supabaseIdktAdmin
      .from('store_users')
      .select('id, full_name, email, store_access_level, is_store_admin, has_special_access')
      .eq('id', user_id)
      .maybeSingle();

    if (uErr || !storeUser) {
      return NextResponse.json({ error: "Selected user is not found or not approved" }, { status: 403 });
    }

    const isApproved = 
      storeUser.store_access_level === 'general' || 
      storeUser.store_access_level === 'internal' || 
      storeUser.is_store_admin || 
      storeUser.has_special_access;

    if (!isApproved) {
      return NextResponse.json({ error: "Selected user does not have store approval" }, { status: 403 });
    }

    // Fetch item details for snapshotting name and price
    const itemIds = items.map((i: any) => i.item_id);
    const { data: dbItems } = await supabaseIdktAdmin
      .from('store_items')
      .select('id, item_code, item_name, cost, variants')
      .in('id', itemIds);

    const dbItemMap = new Map((dbItems || []).map(i => [i.id, i]));

    // Prepare insert payload for store_requests with snapshots
    const insertRows = items.map((item: any) => {
      const dbItem = dbItemMap.get(item.item_id);
      const rawVariant = item.selected_variant || "";

      let cleanVar = rawVariant;
      if (typeof rawVariant === "string" && rawVariant.startsWith('{') && rawVariant.endsWith('}')) {
        try {
          const parsed = JSON.parse(rawVariant);
          if (parsed && typeof parsed === "object") {
            cleanVar = parsed.variant !== undefined ? parsed.variant : (parsed.label !== undefined ? parsed.label : rawVariant);
          }
        } catch (e) {}
      }

      // Calculate unit cost snapshot
      let unitCost = Number(dbItem?.cost) || 0;
      if (dbItem && dbItem.variants) {
        try {
          const { getVariantCost } = require('@/lib/store-variant-utils');
          unitCost = getVariantCost(cleanVar, dbItem.variants, Number(dbItem.cost) || 0);
        } catch (e) {}
      }

      const variantPayload = JSON.stringify({
        variant: cleanVar,
        snapshot_item_name: dbItem?.item_name || "Item",
        snapshot_item_code: dbItem?.item_code || "",
        snapshot_cost: unitCost,
        source: "Public Quick Request"
      });

      return {
        user_id: user_id,
        item_id: item.item_id,
        quantity: Math.max(1, Number(item.quantity) || 1),
        selected_variant: variantPayload,
        status: 'pending'
      };
    });

    const { data: insertedData, error: insertErr } = await supabaseIdktAdmin
      .from('store_requests')
      .insert(insertRows)
      .select(`
        id, user_id, item_id, quantity, selected_variant, status, created_at,
        store_items (item_code, item_name, cost),
        store_users (full_name)
      `);

    if (insertErr) {
      console.error("Error creating public store request:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await logStoreActivity({
      user_id: user_id,
      user_name: storeUser?.full_name || 'Quick Request User',
      user_email: storeUser?.email || '',
      action: 'PUBLIC_REQUEST_SUBMITTED',
      details: `Submitted ${insertedData?.length || 0} item(s) via Public Quick Request page for ${storeUser?.full_name || 'user'}.`,
      metadata: { count: insertedData?.length || 0 }
    });

    return NextResponse.json({ success: true, count: insertedData?.length || 0, data: insertedData });
  } catch (err: any) {
    console.error("Error submitting public request:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
