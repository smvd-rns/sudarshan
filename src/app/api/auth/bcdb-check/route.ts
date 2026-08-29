import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safeQuery } from "@/lib/resilient-db";
import { getCached, CacheKeys } from "@/lib/cache";
import { getUserFromToken } from "@/lib/auth-utils";


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);


export async function GET(req: NextRequest) {
  try {
    // Local JWT decode — no network call to Supabase Auth
    const user = getUserFromToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = user.email;
    const normalizedEmail = email?.toLowerCase().trim() || "";
    if (!normalizedEmail) return NextResponse.json({ isBcdb: false });


    // Cache BCDB result for 24 hours — devotee status rarely changes.
    // Stale-on-error means verified users keep access even if DB is temporarily down.
    const isVerified = await getCached(
      CacheKeys.bcdbVerified(normalizedEmail),
      async () => {
        const { count, error } = await safeQuery(async () =>
            await supabase
                .from("bcdb")
                .select("*", { count: "exact", head: true })
                .or(`email_id.ilike.${normalizedEmail},email_address.ilike.${normalizedEmail}`)
                .eq("is_deleted", false),
            "BCDB Email Check"
        ).catch(err => ({ count: null, error: err }));

        if (error) {
          if (error.message === "Supabase Connection Timeout") {
            throw new Error("Database timeout");
          }
          throw error;
        }
        return !!count;
      },
      604800 // 7 days cache
    );

    // If verified, persist to profile so future loads skip this check
    if (isVerified) {
      try {
        await supabase
          .from("profiles")
          .update({ is_bcdb_verified: true })
          .eq("id", user.id);
      } catch (updateErr) {
        console.warn("Failed to update profile verification status:", updateErr);
      }
    }

    return NextResponse.json({ isBcdb: isVerified });
  } catch (error: any) {
    console.error("BCDB Check Error:", error.message);
    return NextResponse.json({ isBcdb: false }, { status: 500 });
  }
}
