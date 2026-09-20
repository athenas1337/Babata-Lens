"use client";

import React, { useState, useEffect } from "react";

interface ProviderHealthItem {
  id: string;
  name: string;
  capability: string;
  requiredEnvVars: string[];
  healthy: boolean;
  degraded: boolean;
  active: boolean;
}

export const ProviderStatusMatrix: React.FC = () => {
  const [providers, setProviders] = useState<ProviderHealthItem[]>([]);
  const [status, setStatus] = useState<string>("checking...");
  const [timestamp, setTimestamp] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/providers/health");
      const data = await res.json();
      setProviders(data.providers || []);
      setStatus(data.status);
      setTimestamp(data.timestamp);
    } catch {
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

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
            Real-time status of 9 external and offline data adapters.
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
                        p.healthy
                          ? "bg-emerald-cyber shadow-sm shadow-emerald-cyber"
                          : p.degraded
                          ? "bg-amber-glow shadow-sm shadow-amber-glow"
                          : "bg-rose-flare shadow-sm shadow-rose-flare"
                      }`}
                    />
                    <span className="text-[10px] font-mono font-bold uppercase text-gray-300">
                      {p.healthy ? "ONLINE" : p.degraded ? "DEGRADED" : "OFFLINE"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center space-x-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-1 border border-surface-border text-gray-300 uppercase">
                    CAPABILITY: {p.capability}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-surface-border/40 text-[10px] font-mono text-gray-400">
                {p.requiredEnvVars.length === 0 ? (
                  <span className="text-emerald-cyber">Zero-Credential / Open Public API</span>
                ) : (
                  <span>
                    Required Keys:{" "}
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