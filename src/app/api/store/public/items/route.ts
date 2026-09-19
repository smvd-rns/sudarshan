import { NextResponse } from 'next/server';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';

export async function GET() {
  try {
    if (!supabaseIdktAdmin) {
      return NextResponse.json({ error: "DB not configured" }, { status: 500 });
    }

    const { data, error } = await supabaseIdktAdmin
      .from('store_items')
      .select('*')
      .order('item_code', { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
    }

    // Filter out items that are marked out-of-stock / unavailable
    const availableItems = (data || []).filter((item: any) => item.is_available !== false);

    return NextResponse.json(availableItems);
  } catch (err: any) {
    console.error("Error fetching public store items:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
