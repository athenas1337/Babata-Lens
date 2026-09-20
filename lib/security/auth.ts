import { NextRequest } from "next/server";
import { getEnv } from "../config/env";
import { User } from "../db/schema";
import { getDatabase } from "../db";
import { createHmac } from "crypto";

export interface AuthContext {
  user: User;
  isAuthenticated: boolean;
}

/**
 * Generate a valid session token from AUTH_SECRET.
 * Used to create the babata_session cookie value.
 */
export function generateSessionToken(secret: string): string {
  return createHmac("sha256", secret).update("babata-session-v1").digest("hex");
}

/**
 * Validate a session cookie against the AUTH_SECRET using constant-time comparison.
 */
function isValidSession(cookie: string, secret: string): boolean {
  // Accept exact match with AUTH_SECRET (backward compat for single-user MVP)
  if (cookie === secret) return true;

  // Accept HMAC-derived session token
  const expected = generateSessionToken(secret);
  if (cookie.length !== expected.length) return false;

  // Constant-time comparison to prevent timing attacks
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= cookie.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
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
  }

  // 2. Session cookie auth (properly validated)
  const sessionCookie = req.cookies.get("babata_session")?.value;
  if (sessionCookie && isValidSession(sessionCookie, env.AUTH_SECRET)) {
    const user = await db.getOrCreateDefaultOperator();
    return { user, isAuthenticated: true };
  }

  // 3. Auto-auth in development only
  if (env.NODE_ENV === "development") {
    const user = await db.getOrCreateDefaultOperator();
    return { user, isAuthenticated: true };
  }

  return null;
}

export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required. Provide valid session cookie or Authorization header.",
      },
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }
  );
}
