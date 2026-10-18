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

  return fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });
}
