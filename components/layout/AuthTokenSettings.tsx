"use client";

import React, { useEffect, useState } from "react";
import { KeyRound, Check, X, Loader2 } from "lucide-react";
import { getAccessToken, setAccessToken } from "@/lib/api/client";
import { apiFetch } from "@/lib/api/client";

/**
 * AuthTokenSettings — lets an operator store the ADMIN_ACCESS_TOKEN in the
 * browser so API calls carry a bearer token. Only needed when the deployment
 * has ADMIN_ACCESS_TOKEN configured (otherwise same-origin access is allowed).
 */
export const AuthTokenSettings: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  useEffect(() => {
    setToken(getAccessToken() ?? "");
  }, []);

  const handleSave = async () => {
    setAccessToken(token);
    setStatus("testing");
    try {
      const res = await apiFetch("/api/providers/health");
      setStatus(res.ok ? "ok" : "fail");
    } catch {
      setStatus("fail");
    }
  };

  const handleClear = () => {
    setToken("");
    setAccessToken(null);
    setStatus("idle");
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="API access token"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-1 border border-surface-border text-xs font-mono text-gray-300 hover:text-cyan-neon hover:border-cyan-neon/40 transition-all"
      >
        <KeyRound className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">ACCESS</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-72 p-3 rounded-xl glass-hud border border-surface-border shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-bold text-gray-200 uppercase tracking-wider">
              Admin Access Token
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-gray-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] font-mono text-gray-500 mb-2 leading-relaxed">
            Only required if ADMIN_ACCESS_TOKEN is set on the server. Stored locally in this
            browser.
          </p>
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setStatus("idle");
            }}
            placeholder="Paste token…"
            className="w-full px-2.5 py-2 rounded-lg bg-surface-2 border border-surface-border text-xs font-mono text-gray-200 outline-none focus:border-cyan-neon/50"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 px-3 py-1.5 rounded-lg bg-cyan-neon/15 border border-cyan-neon/40 text-xs font-mono font-bold text-cyan-neon hover:bg-cyan-neon/25 transition-all flex items-center justify-center gap-1.5"
            >
              {status === "testing" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Save &amp; Test
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-lg bg-surface-2 border border-surface-border text-xs font-mono text-gray-400 hover:text-gray-200 transition-all"
            >
              Clear
            </button>
          </div>
          {status === "ok" && (
            <p className="mt-2 text-[10px] font-mono text-emerald-cyber">
              ✓ Connected — API access verified.
            </p>
          )}
          {status === "fail" && (
            <p className="mt-2 text-[10px] font-mono text-rose-flare">
              ✗ Could not authenticate with that token.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AuthTokenSettings;
