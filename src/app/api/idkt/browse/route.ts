import { NextRequest, NextResponse } from "next/server";
import { supabaseIdkt, supabaseIdktAdmin } from "@/lib/supabaseIdkt";


/**
 * IDKT BROWSE API
 * Returns folders and audio files for a given parent path.
 */

function normalizeFolderPath(path: string) {
  if (!path || path === "/") return "/";
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return String(error);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawPath = searchParams.get("path") || "/";
    const role = Number(searchParams.get("role") || 0);
    const normalizedPath = normalizeFolderPath(rawPath);
    const legacyPath = normalizedPath === "/" ? "/" : normalizedPath.slice(0, -1);

    // Use admin client for admins to bypass RLS filtering on is_hidden
    const client = (role === 1 && supabaseIdktAdmin) ? supabaseIdktAdmin : supabaseIdkt;

    if (!client) {
      return NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 });
    }

    let query = client
      .from("idkt_items")
      .select("*")
      .in("parent_path", [normalizedPath, legacyPath]);

    // Non-admins only see non-hidden items
    if (role !== 1) {
      query = query.eq("is_hidden", false);
    }

    const { data: items, error } = await query
      .order("type", { ascending: false }) // Folders first
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' }
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
