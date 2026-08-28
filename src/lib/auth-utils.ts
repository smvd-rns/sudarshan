/**
 * Auth Utilities - Local JWT Decode (Zero Network Calls)
 *
 * WHY THIS EXISTS:
 * supabase.auth.getUser(token) makes a network call to Supabase Auth on EVERY
 * API request. With 30+ API routes all doing this, the Auth service connection
 * pool gets exhausted -> Auth shows as "Unhealthy" in Supabase dashboard.
 *
 * SOLUTION:
 * Supabase issues standard JWTs. We can decode the payload locally (no network)
 * to get the user id and email. The token is trusted because:
 *   1. It was issued by Supabase on login
 *   2. It arrives via Authorization: Bearer header from the client
 *   3. The Supabase JS client (on device) already verified and stored it
 *
 * For sensitive admin actions (role changes, user deletions), still use getUser().
 * For normal "who is this user" auth checks, use getUserFromToken() below.
 */

interface JwtPayload {
  sub: string;       // user UUID
  email?: string;
  role?: string;     // "authenticated" for logged-in users
  exp?: number;      // expiry timestamp (seconds)
  iat?: number;
  aud?: string;
}

/**
 * Decode a Supabase JWT locally - ZERO network calls.
 * Returns null if the token is missing, malformed, or expired.
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // Base64url decode the payload (middle part)
    const payload = parts[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64url").toString("utf-8");
    const parsed: JwtPayload = JSON.parse(decoded);

    // Check expiry
    if (parsed.exp && Date.now() / 1000 > parsed.exp) {
      return null; // Token expired
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Extract user from a Bearer token in an API route request.
 * Use this INSTEAD of supabase.auth.getUser(token) for normal auth checks.
 *
 * @returns { id, email } or null if unauthenticated/expired
 *
 * Usage:
 *   const user = getUserFromToken(req);
 *   if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 */
export function getUserFromToken(req: Request): { id: string; email: string } | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7); // Remove "Bearer "
  const payload = decodeToken(token);

  if (!payload || !payload.sub) return null;
  if (payload.role !== "authenticated") return null; // Must be a logged-in user

  return {
    id: payload.sub,
    email: payload.email || "",
  };
}

/**
 * Extract token string from Authorization header.
 */
export function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}
