"use client";

import React, { useCallback, useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Loader2, Activity } from "lucide-react";
import { CoinSummary } from "@/lib/providers/interfaces";
import { apiFetch } from "@/lib/api/client";

interface MoversResponse {
  gainers: CoinSummary[];
  losers: CoinSummary[];
  sentiment: {
    advancing: number;
    declining: number;
    total: number;
    score: number;
  };
  source: { provider: string; fetchedAt: string };
}

interface MarketMoversProps {
  onSelect?: (coin: CoinSummary) => void;
  limit?: number;
}

/**
 * MarketMovers — top 24h gainers/losers from the top-250 coin universe plus a
 * market-breadth sentiment gauge. Clicking a row opens it in the terminal chart.
 */
export const MarketMovers: React.FC<MarketMoversProps> = ({ onSelect, limit = 6 }) => {
  const [data, setData] = useState<MoversResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"gainers" | "losers">("gainers");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/market/movers?limit=${limit}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setData((await res.json()) as MoversResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load movers");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 90_000);
    return () => window.clearInterval(id);
  }, [load]);

  const rows = data ? (tab === "gainers" ? data.gainers : data.losers) : [];

  return (
    <div className="rounded-xl glass-hud border border-surface-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-surface-border/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-neon" />
          <span className="text-xs font-mono font-bold text-gray-200 uppercase tracking-wider">
            Market Movers
          </span>
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-1 border border-surface-border">
          <button
            type="button"
            onClick={() => setTab("gainers")}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
              tab === "gainers" ? "bg-emerald-cyber/15 text-emerald-cyber font-bold" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            GAINERS
          </button>
          <button
            type="button"
            onClick={() => setTab("losers")}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
              tab === "losers" ? "bg-rose-flare/15 text-rose-flare font-bold" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            LOSERS
          </button>
        </div>
      </div>

      {/* Sentiment gauge */}
      {data && (
        <div className="px-4 py-2.5 border-b border-surface-border/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono text-gray-500 uppercase">
              Breadth · {data.sentiment.advancing}↑ / {data.sentiment.declining}↓
            </span>
            <span
              className={`text-[10px] font-mono font-bold ${
                data.sentiment.score >= 50 ? "text-emerald-cyber" : "text-rose-flare"
              }`}
            >
              {data.sentiment.score}/100
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-flare via-amber-400 to-emerald-cyber transition-all"
              style={{ width: `${data.sentiment.score}%` }}
            />
          </div>
        </div>
      )}

      <div className="divide-y divide-surface-border/40 max-h-[320px] overflow-y-auto">
        {loading && !data ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs font-mono text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-neon" />
            Scanning universe...
          </div>
        ) : error ? (
          <div className="py-6 px-4 text-center text-xs font-mono text-rose-flare">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-6 px-4 text-center text-xs font-mono text-gray-500">
            No data available
          </div>
        ) : (
          rows.map((coin) => {
            const up = (coin.change24h ?? 0) >= 0;
            return (
              <button
                key={coin.id}
                type="button"
                onClick={() => onSelect?.(coin)}
                className="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-2/40 transition-colors text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {coin.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coin.image} alt={coin.name} className="w-6 h-6 rounded-full shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-surface-2 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-bold text-gray-200 truncate">
                      {coin.symbol}
                    </div>
                    <div className="text-[10px] font-mono text-gray-500 truncate">{coin.name}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono text-gray-200">
                    {coin.priceUsd !== undefined
                      ? `$${coin.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                      : "--"}
                  </div>
                  <div
                    className={`text-[11px] font-mono font-bold flex items-center gap-0.5 justify-end ${
                      up ? "text-emerald-cyber" : "text-rose-flare"
                    }`}
                  >
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? "+" : ""}
                    {(coin.change24h ?? 0).toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MarketMovers;
