import { NextRequest, NextResponse } from "next/server";
import { supabaseIdkt, supabaseIdktAdmin } from "@/lib/supabaseIdkt";

export const dynamic = "force-dynamic";

/**
 * IDKT SEARCH API
 * Global multi-token fuzzy search across all audio lectures.
 * Allows searching out-of-order terms (e.g. "the holy name" matches "Holy Name - The Weapon of Lord Chaitanya").
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ items: [] });
    }

    const role = Number(searchParams.get("role") || 0);

    // Use admin client for admins to bypass RLS filtering on is_hidden
    const client = (role === 1 && supabaseIdktAdmin) ? supabaseIdktAdmin : supabaseIdkt;

    if (!client) {
      return NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 });
    }

    const rawTokens = query.trim().split(/\s+/).filter(Boolean);
    const stopWords = new Set(["the", "a", "an", "of", "in", "on", "at", "by", "for", "with", "to", "and", "-"]);
    
    // Filter out stop words unless the entire query consists only of stop words
    let searchTokens = rawTokens.filter(t => !stopWords.has(t.toLowerCase()));
    if (searchTokens.length === 0) {
      searchTokens = rawTokens;
    }

    let dbQuery = client
      .from("idkt_items")
      .select("*")
      .eq("type", "audio");

    // Apply multi-token AND matching so all key search terms must exist regardless of word order
    for (const token of searchTokens) {
      dbQuery = dbQuery.ilike("name", `%${token}%`);
    }

    if (role !== 1) {
      dbQuery = dbQuery.eq("is_hidden", false);
    }

    const { data: items, error } = await dbQuery.limit(50);

    if (error) throw error;

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
