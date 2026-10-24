"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api/client";

interface ProviderHealthItem {
  id: string;
  name: string;
  capability: string;
  requiredEnvVars: string[];
  configured?: boolean;
  healthy: boolean;
  degraded: boolean;
  active: boolean;
  primary?: boolean;
  latencyMs?: number;
}

export const ProviderStatusMatrix: React.FC = () => {
  const [providers, setProviders] = useState<ProviderHealthItem[]>([]);
  const [status, setStatus] = useState<string>("checking...");
  const [timestamp, setTimestamp] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [persistence, setPersistence] = useState<string>("");

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/providers/health");
      const data = await res.json();
      setProviders(data.providers || []);
      setStatus(data.status);
      setTimestamp(data.timestamp);
      setPersistence(data.persistence || "");
    } catch {
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  // Tell the operator which engine will actually answer: a paid model, or the
  // offline rule engine that only reports that data is unavailable.
  const liveAi = providers.find((p) => p.capability === "ai" && p.primary && p.id !== "local-babata");
  const offlineOnly = !providers.some(
    (p) => p.capability === "ai" && p.primary && p.id !== "local-babata" && p.configured
  );

  return (
    <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 rounded-xl glass-hud border border-surface-border gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold font-mono text-cyan-neon">
              DATA PROVIDER HEALTH MATRIX
            </h2>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                status === "healthy"
                  ? "bg-emerald-cyber/10 text-emerald-cyber border border-emerald-cyber/30"
                  : "bg-amber-glow/10 text-amber-glow border border-amber-glow/30"
              }`}
            >
              {status}
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Real-time status of every external data adapter.
            {persistence && (
              <span className="ml-2 text-gray-500">
                Persistence: <code className="text-gray-300">{persistence}</code>
                {persistence === "memory" && " (history resets on redeploy — set DATABASE_URL)"}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {timestamp && (
            <span className="text-[11px] font-mono text-gray-500">
              Synced: {new Date(timestamp).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={fetchHealth}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg bg-surface-1 hover:bg-surface-2 border border-surface-border text-xs font-mono text-cyan-glow hover:text-cyan-neon transition-all"
          >
            {isLoading ? "PROBING..." : "REFRESH"}
          </button>
        </div>
      </div>

      {providers.length > 0 && (
        <div
          className={`p-4 rounded-xl border text-xs font-mono leading-relaxed ${
            offlineOnly
              ? "bg-amber-glow/10 border-amber-glow/40 text-amber-glow"
              : "bg-emerald-cyber/10 border-emerald-cyber/30 text-emerald-cyber"
          }`}
        >
          {offlineOnly ? (
            <>
              ⚠ No live LLM key detected — the chat runs on the <strong>offline rule engine</strong>,
              which will not call tools or reason over live data. Add one of{" "}
              <code className="text-gray-200">OPENROUTER_API_KEY</code>,{" "}
              <code className="text-gray-200">ANTHROPIC_API_KEY</code> or{" "}
              <code className="text-gray-200">GOOGLE_AI_API_KEY</code> to enable
              autonomous analysis.
            </>
          ) : (
            <>✓ Live LLM active: <strong>{liveAi?.name}</strong> is handling agent reasoning.</>
          )}
        </div>
      )}

      {/* Grid of Providers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {providers.map((p) => {
          return (
            <div
              key={p.id}
              className="p-4 rounded-xl glass-hud border border-surface-border flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-mono font-bold text-gray-100">{p.name}</h3>
                    <span className="text-[10px] font-mono text-cyan-glow">{p.id}</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        p.configured === false
                          ? "bg-gray-600"
                          : p.healthy
                          ? "bg-emerald-cyber shadow-sm shadow-emerald-cyber"
                          : p.degraded
                          ? "bg-amber-glow shadow-sm shadow-amber-glow"
                          : "bg-rose-flare shadow-sm shadow-rose-flare"
                      }`}
                    />
                    <span className="text-[10px] font-mono font-bold uppercase text-gray-300">
                      {p.configured === false
                        ? "NO KEY"
                        : p.healthy
                        ? "ONLINE"
                        : p.degraded
                        ? "DEGRADED"
                        : "OFFLINE"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-1 border border-surface-border text-gray-300 uppercase">
                    CAPABILITY: {p.capability}
                  </span>
                  {p.primary && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-neon/10 border-cyan-neon/40 text-cyan-neon uppercase">
                      PRIMARY
                    </span>
                  )}
                  {typeof p.latencyMs === "number" && p.healthy && (
                    <span className="text-[10px] font-mono text-gray-500">{p.latencyMs}ms</span>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-surface-border/40 text-[10px] font-mono text-gray-400">
                {p.requiredEnvVars.length === 0 ? (
                  <span className="text-emerald-cyber">Zero-Credential / Open Public API</span>
                ) : (
                  <span>
                    {p.configured === false ? "Unlocks with: " : "Required Keys: "}
                    <code className="text-gray-300">{p.requiredEnvVars.join(", ")}</code>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};