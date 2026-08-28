import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-utils";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifySession(req: NextRequest) {
  // Local JWT decode — zero network
  const user = getUserFromToken(req);
  if (!user) return null;
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, roles")
    .eq("id", user.id)
    .single();
    
  if (!profile) return null;
  
  const roles = (Array.isArray(profile.roles) ? profile.roles : [profile.role])
    .filter(r => r !== null && r !== undefined)
    .map(Number);
    
  const isPrivileged = roles.includes(1) || roles.includes(3) || roles.includes(5);
  
  return {
    userId: user.id,
    email: user.email?.toLowerCase().trim() || "",
    isPrivileged
  };
}

/**
 * ATTENDANCE EXCEPTION API
 * Handles reporting reasons for absence (Sick, Seva, etc.)
 */

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { user_email, startDate, endDate, reason_type, comment, applied_sessions } = body;

    if (!user_email || !startDate || !endDate || !reason_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const targetEmail = user_email.toLowerCase().trim();
    if (targetEmail !== session.email && !session.isPrivileged) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate dates between startDate and endDate
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates: string[] = [];
    
    let current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    // We store exceptions *per session* (not as one grouped row per user+date),
    // so updating one attendance reason doesn't overwrite the other sessions.
    const { data: machines, error: machinesError } = await supabase
      .from("attendance_machines")
      .select("description, serial_number");
    if (machinesError) throw machinesError;

    const allSessions = (machines || [])
      .map((m: any) => m?.description || m?.serial_number)
      .filter(Boolean);

    // `Harinam` is a virtual machine added in the report endpoint (not stored in
    // `attendance_machines`). When the UI submits "All", we still want the
    // exception to show up in the Harinam column, so include it here.
    if (!allSessions.includes("Harinam")) allSessions.push("Harinam");
    // Some parts of the UI/admin flow refer to it as "Hari Nam".
    if (!allSessions.includes("Hari Nam")) allSessions.push("Hari Nam");

    const normalizeSessions = (sessions: any): string[] => {
      if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return allSessions;
      if (sessions.includes("All")) return allSessions;
      return sessions.filter(Boolean);
    };

    const targetSessions = normalizeSessions(applied_sessions);

    // Load existing rows for these dates, then rebuild rows so only the selected
    // sessions change while the others keep their old reason/comment.
    const { data: existingRows, error: existingError } = await supabase
      .from("attendance_exceptions")
      .select("*")
      .eq("user_email", targetEmail)
      .in("date", dates);
    if (existingError) throw existingError;

    const { error: deleteError } = await supabase
      .from("attendance_exceptions")
      .delete()
      .eq("user_email", targetEmail)
      .in("date", dates);
    if (deleteError) throw deleteError;

    const newRows: any[] = [];

    for (const date of dates) {
      // Keep non-target sessions from existing rows
      const rowsForDate = (existingRows || []).filter((r: any) => r.date === date);
      for (const old of rowsForDate) {
        const oldApplied = normalizeSessions(old.applied_sessions);
        for (const session of oldApplied) {
          if (targetSessions.includes(session)) continue; // will be replaced
          newRows.push({
            user_email: targetEmail,
            date,
            reason_type: old.reason_type,
            comment: old.comment,
            applied_sessions: [session], // per-session row
          });
        }
      }

      // Insert target sessions with the newly provided reason/comment
      for (const session of targetSessions) {
        newRows.push({
          user_email: targetEmail,
          date,
          reason_type,
          comment,
          applied_sessions: [session], // per-session row
        });
      }
    }

    const { data, error } = await supabase
      .from("attendance_exceptions")
      .insert(newRows)
      .select();

    if (error) throw error;

    return NextResponse.json({ message: "Exceptions reported successfully", data });

  } catch (error: any) {
    console.error("Exception API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let query = supabase.from("attendance_exceptions").select("*");

    const targetEmail = email ? email.toLowerCase().trim() : "";
    if (targetEmail) {
      if (targetEmail !== session.email && !session.isPrivileged) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      query = query.eq("user_email", targetEmail);
    } else {
      if (!session.isPrivileged) {
        query = query.eq("user_email", session.email);
      }
    }

    if (startDate) query = query.gte("date", startDate);
    if (endDate) query = query.lte("date", endDate);

    const { data, error } = await query.order("date", { ascending: false }); // Show newest first

    if (error) throw error;

    return NextResponse.json({ data });

  } catch (error: any) {
    console.error("Exception API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing required parameter: id" }, { status: 400 });
    }

    const ids = id.split(",");

    // Verify ownership of the exceptions being deleted
    const { data: existing, error: fetchError } = await supabase
      .from("attendance_exceptions")
      .select("user_email")
      .in("id", ids);

    if (fetchError) throw fetchError;

    if (existing && existing.length > 0) {
      const containsOthers = existing.some(
        (ex: any) => ex.user_email?.toLowerCase().trim() !== session.email
      );
      if (containsOthers && !session.isPrivileged) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { error } = await supabase
      .from("attendance_exceptions")
      .delete()
      .in("id", ids);

    if (error) throw error;

    return NextResponse.json({ message: "Exceptions deleted successfully" });
  } catch (error: any) {
    console.error("Exception API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
