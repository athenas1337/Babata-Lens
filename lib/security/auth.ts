import { NextRequest } from "next/server";
import { getEnv } from "../config/env";
import { User } from "../db/schema";
import { getDatabase } from "../db";
import { createHmac, timingSafeEqual } from "crypto";

export interface AuthContext {
  user: User;
  isAuthenticated: boolean;
}

/**
 * Derive the deterministic session token from AUTH_SECRET.
 * This is the ONLY accepted cookie value (never AUTH_SECRET itself).
 */
export function generateSessionToken(secret: string): string {
  return createHmac("sha256", secret).update("babata-session-v1").digest("hex");
}

/**
 * Validate a session cookie against the derived HMAC token using a
 * constant-time comparison to prevent timing attacks.
 */
function isValidSession(cookie: string, secret: string): boolean {
  const expected = generateSessionToken(secret);
  const a = Buffer.from(cookie);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function authenticateRequest(req: NextRequest): Promise<AuthContext | null> {
  const env = getEnv();
  const db = getDatabase();

  // 1. Bearer token auth (admin access token)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (env.ADMIN_ACCESS_TOKEN && token === env.ADMIN_ACCESS_TOKEN) {
      const user = await db.getOrCreateDefaultOperator();
      return { user, isAuthenticated: true };
    }
    return null;
  }

  // 2. Session cookie auth (HMAC-derived token only)
  const sessionCookie = req.cookies.get("babata_session")?.value;
  if (sessionCookie && isValidSession(sessionCookie, env.AUTH_SECRET)) {
    const user = await db.getOrCreateDefaultOperator();
    return { user, isAuthenticated: true };
  }

  // 3. Explicit, opt-in development bypass (never enabled implicitly in prod).
  if (env.NODE_ENV === "development" && env.DEV_ALLOW_ANONYMOUS === "true") {
    const user = await db.getOrCreateDefaultOperator();
    return { user, isAuthenticated: true };
  }

  return null;
}
