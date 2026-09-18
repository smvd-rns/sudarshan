import { NextResponse } from 'next/server';
import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth-utils';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    if (!supabaseIdktAdmin) return NextResponse.json({ error: "IDKT DB not configured" }, { status: 500 });

    const { data, error } = await supabaseIdktAdmin!
      .from('store_users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Fetch live mobile & temple from Main DB
    const { data: mainProfile } = await supabaseAdmin!
      .from('profiles')
      .select('mobile, temple, full_name')
      .eq('id', user.id)
      .maybeSingle();

    return NextResponse.json({
      ...data,
      full_name: mainProfile?.full_name || data.full_name || '',
      mobile: mainProfile?.mobile || 'N/A',
      temple: mainProfile?.temple || 'N/A'
    });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "No auth header" }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    
    const user = getUserFromToken(request);
    if (!user || !user.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    if (!supabaseIdktAdmin) return NextResponse.json({ error: "IDKT DB not configured" }, { status: 500 });

    const body = await request.json();
    const { kurta_size, chappal_size, color_preference, sarvadhan_access_requested } = body;

    const { error } = await supabaseIdktAdmin!
      .from('store_users')
      .update({
        kurta_size,
        chappal_size,
        color_preference,
        sarvadhan_access_requested,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (error) {
      console.error("Error updating store_user:", error);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
