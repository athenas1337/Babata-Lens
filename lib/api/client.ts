"use client";

/**
 * Client-side API helper.
 *
 * The backend authenticates via either:
 *  1. `Authorization: Bearer <ADMIN_ACCESS_TOKEN>` header, or
 *  2. the `babata_session` cookie (HMAC derived from AUTH_SECRET).
 *
 * The browser automatically sends same-origin cookies, so the cookie path works
 * without extra work — but we still expose a token hook so deployments that
 * require an explicit bearer token (ADMIN_ACCESS_TOKEN set, cookie not issued)
 * keep working. The token is read from `localStorage` when present and can be
 * supplied by the user through the settings UI.
 */

const TOKEN_STORAGE_KEY = "babata_access_token";
const SESSION_COOKIE = "babata_session";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token && token.trim()) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Mint the session cookie when the deployment has no ADMIN_ACCESS_TOKEN.
 *
 * The API only authenticates browser calls through the `babata_session` cookie
 * (derived from AUTH_SECRET). Without this, a first-time visitor without a
 * bearer token got 401 on every endpoint. The health endpoint is the one route
 * that answers this bootstrap request regardless, and it hands back the token
 * the page is allowed to hold.
 */
let sessionBootstrap: Promise<void> | null = null;

function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${SESSION_COOKIE}=`));
}

async function ensureSessionCookie(): Promise<void> {
  if (hasSessionCookie()) return;
  if (!sessionBootstrap) {
    sessionBootstrap = (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "same-origin" });
        if (!res.ok) {
          sessionBootstrap = null; // allow a retry on the next request
        }
      } catch {
        sessionBootstrap = null;
      }
    })();
  }
  return sessionBootstrap;
}

/**
 * `fetch` wrapper that attaches the bearer token (if configured) and always
 * sends same-origin credentials so the session cookie is included.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("Accept", "application/json");

  // Explicit-token deployments do not need the cookie; everyone else does.
  if (!token) await ensureSessionCookie();

  const run = () =>
    fetch(input, {
      ...init,
      headers,
      credentials: "same-origin",
    });

  const response = await run();
  if (response.status !== 401 || token || hasSessionCookie()) return response;

  // Cookie was absent/expired (e.g. AUTH_SECRET rotated): mint it and retry once.
  await ensureSessionCookie();
  return run();
}
