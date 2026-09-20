"use client";

import React, { useState, useEffect } from "react";
import { TokenMarketData, PricePoint } from "@/lib/providers/interfaces";

export const MarketOverview: React.FC = () => {
  const tokens = ["BTC", "ETH", "SOL", "BNB", "XRP", "AVAX"];
  const [selectedToken, setSelectedToken] = useState("BTC");
  const [timeframe, setTimeframe] = useState("7d");
  const [marketData, setMarketData] = useState<TokenMarketData | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarket = async (symbol: string, tf: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market?symbol=${symbol}&timeframe=${tf}`);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();
      if (data.token) setMarketData(data.token);
      if (data.history) setHistory(data.history);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load market metrics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMarket(selectedToken, timeframe);
  }, [selectedToken, timeframe]);

  // Calculate SVG chart coordinates
  const renderChart = () => {
    if (!history || history.length < 2) {
      return (
        <div className="h-48 flex items-center justify-center text-xs font-mono text-gray-500">
          No chart data available for selected timeframe
        </div>
      );
    }

    const prices = history.map((h) => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const width = 800;
    const height = 220;
    const padding = 20;

    const points = history.map((item, idx) => {
      const x = padding + (idx / (history.length - 1)) * (width - padding * 2);
      const y = height - padding - ((item.price - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathD = `M ${points.join(" L ")}`;
    const areaD = `${pathD} L ${width - padding},${height} L ${padding},${height} Z`;

    const isPositive = (marketData?.change24h ?? 0) >= 0;
    const strokeColor = isPositive ? "#00F0FF" : "#F43F5E";
    const gradientId = `chart-grad-${selectedToken}`;

    return (
      <div className="relative w-full h-56 mt-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={padding}
            y1={padding}
            x2={width - padding}
            y2={padding}
            stroke="rgba(103, 232, 249, 0.08)"
            strokeDasharray="4 4"
          />
          <line
            x1={padding}
            y1={height / 2}
            x2={width - padding}
            y2={height / 2}
            stroke="rgba(103, 232, 249, 0.08)"
            strokeDasharray="4 4"
          />
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="rgba(103, 232, 249, 0.08)"
            strokeDasharray="4 4"
          />

          {/* Area under curve */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Line curve */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 6px ${strokeColor})` }}
          />
        </svg>

        {/* Max and Min tags */}
        <div className="absolute top-1 left-2 text-[10px] font-mono text-gray-400">
          MAX: ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div className="absolute bottom-1 left-2 text-[10px] font-mono text-gray-400">
          MIN: ${min.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-4 space-y-4">
      {/* Token Switcher Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {tokens.map((sym) => {
          const isSelected = sym === selectedToken;
          return (
            <button
              key={sym}
              type="button"
              onClick={() => setSelectedToken(sym)}
              className={`p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? "bg-surface-2 border-cyan-neon shadow-hud-cyan"
                  : "bg-surface-1 border-surface-border hover:border-surface-border-hover hover:bg-surface-2/60"
              }`}
            >
              <div className="text-xs font-mono font-bold text-gray-400">{sym}</div>
              <div className="text-sm font-mono font-semibold text-gray-100 mt-1">
                {isSelected && marketData
                  ? `$${marketData.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : "--"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Chart HUD Container */}
      <div className="p-5 rounded-xl glass-hud border border-surface-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-bold font-mono text-gray-100">
                {selectedToken} / USD
              </h2>
              {marketData && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                    marketData.change24h >= 0
                      ? "bg-emerald-cyber/10 text-emerald-cyber border border-emerald-cyber/30"
                      : "bg-rose-flare/10 text-rose-flare border border-rose-flare/30"
                  }`}
                >
                  {marketData.change24h >= 0 ? "+" : ""}
                  {marketData.change24h.toFixed(2)}%
                </span>
              )}
            </div>
            <div className="text-2xl font-mono font-extrabold text-cyan-neon mt-1">
              {marketData
                ? `$${marketData.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
                : "--"}
            </div>
          </div>

          {/* Timeframe Controls */}
          <div className="flex items-center space-x-1 p-1 rounded-lg bg-surface-1 border border-surface-border">
            {["24h", "7d", "30d", "1y"].map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded text-xs font-mono transition-all ${
                  timeframe === tf
                    ? "bg-cyan-neon/20 text-cyan-neon font-bold shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Metrics Grid */}
        {marketData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-surface-border/50">
            <div>
              <span className="text-[11px] font-mono text-gray-400">24H VOLUME</span>
              <p className="text-sm font-mono text-gray-200 mt-0.5">
                ${(marketData.volume24h ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-mono text-gray-400">MARKET CAP</span>
              <p className="text-sm font-mono text-gray-200 mt-0.5">
                ${(marketData.marketCap ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-mono text-gray-400">INDEX ID</span>
              <p className="text-sm font-mono text-gray-200 mt-0.5 truncate">
                {marketData.id}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-mono text-gray-400">TELEMETRY SYNC</span>
              <p className="text-sm font-mono text-gray-200 mt-0.5">
                {new Date(marketData.lastUpdated).toLocaleTimeString()}
              </p>
            </div>
          </div>
        )}

        {/* Chart View */}
        {isLoading ? (
          <div className="h-56 flex flex-col items-center justify-center space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-cyan-neon border-t-transparent animate-spin" />
            <span className="text-xs font-mono text-gray-400">
              Aggregating price feeds...
            </span>
          </div>
        ) : error ? (
          <div className="h-56 flex items-center justify-center text-xs font-mono text-rose-flare">
            {error}
          </div>
        ) : (
          renderChart()
        )}
      </div>
    </div>
  );
};