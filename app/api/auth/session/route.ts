import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";
import { generateSessionToken } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/auth/session
 *
 * Issues the `babata_session` cookie (an HMAC derived from AUTH_SECRET) so the
 * browser can authenticate without an explicit ADMIN_ACCESS_TOKEN.
 *
 * Security posture:
 * - The cookie value is derived, never AUTH_SECRET itself, and is compared in
 *   constant time by `authenticateRequest`.
 * - Only same-origin browser loads receive it: cross-site requests are blocked
 *   by SameSite=Lax plus an Origin/Host equality check.
 * - When ADMIN_ACCESS_TOKEN *is* configured, bearer-token auth is authoritative
 *   and no anonymous session is minted.
 */
function isSameOriginRequest(req: NextRequest): boolean {
  const host = req.headers.get("host");
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!host || !origin) return true; // same-origin navigations may omit Origin
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  return issueSession(req, false);
}

export async function POST(req: NextRequest) {
  return issueSession(req, true);
}

function issueSession(req: NextRequest, requireOrigin: boolean): NextResponse {
  const env = getEnv();

  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit("session", `bootstrap:${ip}`, { windowMs: 60_000, max: 30 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Cross-origin session requests are not allowed" }, { status: 403 });
  }
  if (requireOrigin && !req.headers.get("origin")) {
    return NextResponse.json({ error: "Origin header required" }, { status: 403 });
  }

  if (env.ADMIN_ACCESS_TOKEN) {
    return NextResponse.json(
      {
        authenticated: false,
        requiresToken: true,
        message: "This deployment requires an admin access token (ADMIN_ACCESS_TOKEN).",
      },
      { status: 401 }
    );
  }

  const authSecret = env.AUTH_SECRET;
  if (!authSecret) {
    // A session cookie can only be signed with AUTH_SECRET. Tell the operator
    // exactly what to set instead of failing every request with a bare 401.
    return NextResponse.json(
      {
        authenticated: false,
        error:
          "Server is not configured: set AUTH_SECRET (32+ chars, e.g. `openssl rand -hex 32`) " +
          "or ADMIN_ACCESS_TOKEN in the deployment environment.",
      },
      { status: 503 }
    );
  }

  const res = NextResponse.json({ authenticated: true });
  res.cookies.set("babata_session", generateSessionToken(authSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
