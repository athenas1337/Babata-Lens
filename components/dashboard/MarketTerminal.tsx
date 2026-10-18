"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, BarChart3, Zap } from "lucide-react";
import { CoinSummary, TokenMarketData } from "@/lib/providers/interfaces";
import { resolveTradingViewSymbol, ChartInterval, INTERVAL_OPTIONS } from "@/lib/tradingview/symbols";
import { useCoinUniverse } from "@/lib/hooks/useCoinUniverse";
import { apiFetch } from "@/lib/api/client";
import { CoinSelector } from "./CoinSelector";
import { MarketMovers } from "./MarketMovers";
import { TradingViewAdvancedChart } from "../charts/TradingViewAdvancedChart";

interface MarketApiResponse {
  token: TokenMarketData;
  tradingView: {
    symbol: string;
    base: string;
    exchange: string;
    quote: string;
    interval: ChartInterval;
  };
  source: { provider: string; fetchedAt: string };
}

const DEFAULT_COIN: CoinSummary = {
  id: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  tradingViewSymbol: "BINANCE:BTCUSDT",
};

/**
 * MarketTerminal — TradingView advanced chart + 1000+ coin universe selector,
 * enriched with live CoinGecko market metrics.
 */
export const MarketTerminal: React.FC = () => {
  const {
    filtered,
    loading: coinsLoading,
    loadingMore,
    error: coinsError,
    search,
    setSearch,
    loadMore,
    hasMore,
  } = useCoinUniverse();

  const [selected, setSelected] = useState<CoinSummary>(DEFAULT_COIN);
  const [interval, setInterval_] = useState<ChartInterval>("D");
  const [market, setMarket] = useState<TokenMarketData | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);

  const tvSymbol = useMemo(
    () => resolveTradingViewSymbol(selected.tradingViewSymbol || selected.symbol).symbol,
    [selected]
  );

  const fetchMarket = useCallback(async (symbol: string) => {
    setMarketLoading(true);
    setMarketError(null);
    try {
      const res = await apiFetch(`/api/market?symbol=${encodeURIComponent(symbol)}&history=false`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as MarketApiResponse;
      setMarket(data.token);
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : "Failed to load market data");
      setMarket(null);
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMarket(selected.symbol);
  }, [selected, fetchMarket]);

  // Refresh spot metrics every 60s while the terminal is open.
  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchMarket(selected.symbol);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [selected, fetchMarket]);

  const handleSelect = (coin: CoinSummary) => {
    setSelected(coin);
    setShowSelector(false);
  };

  const positive = (market?.change24h ?? selected.change24h ?? 0) >= 0;
  const price = market?.priceUsd ?? selected.priceUsd;
  const change = market?.change24h ?? selected.change24h ?? 0;

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4">
      <div className="flex gap-4">
        {/* ── Left: Coin Universe Selector ─────────────────────────── */}
        <aside
          className={`${
            showSelector ? "fixed inset-0 z-40 bg-canvas/95 backdrop-blur p-4" : "hidden"
          } lg:relative lg:flex lg:inset-auto lg:bg-transparent lg:p-0 lg:backdrop-blur-none lg:z-auto lg:w-72 lg:shrink-0`}
        >
          <div className="w-full lg:w-72 h-full lg:max-h-[calc(100vh-6rem)] lg:sticky lg:top-20 p-3 rounded-xl glass-hud border border-surface-border flex flex-col">
            <div className="flex items-center justify-between mb-2 lg:mb-0 shrink-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-neon" />
                <h3 className="text-xs font-mono font-bold text-gray-200 uppercase tracking-wider">
                  Coin Universe
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSelector(false)}
                className="lg:hidden text-gray-400 hover:text-gray-200 text-xs font-mono"
              >
                CLOSE
              </button>
            </div>
            <div className="mt-2 flex-1 min-h-0">
              <CoinSelector
                coins={filtered}
                loading={coinsLoading}
                loadingMore={loadingMore}
                error={coinsError}
                search={search}
                onSearchChange={setSearch}
                onSelect={handleSelect}
                selectedId={selected.id}
                onLoadMore={loadMore}
                hasMore={hasMore}
              />
            </div>
          </div>
        </aside>

        {/* ── Right: Chart + Metrics ───────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Header row */}
          <div className="p-4 rounded-xl glass-hud border border-surface-border">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowSelector(true)}
                  className="lg:hidden px-2.5 py-1.5 rounded-lg bg-surface-1 border border-surface-border text-xs font-mono text-cyan-neon"
                >
                  ☰ Coins
                </button>

                {selected.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.image}
                    alt={selected.name}
                    className="w-8 h-8 rounded-full shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold font-mono text-gray-100 truncate">
                      {selected.symbol}
                      <span className="text-gray-500"> / {market?.name || selected.name}</span>
                    </h2>
                    {marketLoading ? (
                      <Loader2 className="w-4 h-4 text-cyan-neon animate-spin" />
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-mono font-bold flex items-center gap-1 ${
                          positive
                            ? "bg-emerald-cyber/10 text-emerald-cyber border border-emerald-cyber/30"
                            : "bg-rose-flare/10 text-rose-flare border border-rose-flare/30"
                        }`}
                      >
                        {positive ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {positive ? "+" : ""}
                        {change.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-mono font-extrabold text-cyan-neon mt-0.5">
                    {price !== undefined
                      ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                      : "--"}
                  </div>
                </div>
              </div>

              {/* Interval controls */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-1 border border-surface-border">
                {INTERVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setInterval_(opt.id)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                      interval === opt.id
                        ? "bg-cyan-neon/20 text-cyan-neon font-bold"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-surface-border/50">
              <Metric label="24H VOLUME" value={fmtUsd(market?.volume24h)} />
              <Metric label="MARKET CAP" value={fmtUsd(market?.marketCap)} />
              <Metric label="TV SYMBOL" value={tvSymbol} mono />
              <Metric
                label="SYNC"
                value={
                  market?.lastUpdated
                    ? new Date(market.lastUpdated).toLocaleTimeString()
                    : "--"
                }
              />
            </div>

            {marketError && (
              <div className="mt-3 text-xs font-mono text-amber-400/90 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" />
                Live metrics unavailable ({marketError}) — chart still active.
              </div>
            )}
          </div>

          {/* TradingView Advanced Chart */}
          <div className="rounded-xl glass-hud border border-surface-border overflow-hidden">
            <div className="px-4 py-2 border-b border-surface-border/60 flex items-center justify-between">
              <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                TradingView · Advanced Chart
              </span>
              <span className="text-[10px] font-mono text-gray-500">
                Powered by TradingView
              </span>
            </div>
            <TradingViewAdvancedChart
              symbol={tvSymbol}
              interval={interval}
              height={520}
              allowSymbolChange={false}
            />
          </div>

          {/* Market Movers */}
          <MarketMovers onSelect={handleSelect} limit={6} />
        </div>
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="min-w-0">
    <span className="text-[11px] font-mono text-gray-400">{label}</span>
    <p
      className={`text-sm ${mono ? "font-mono" : "font-mono"} text-gray-200 mt-0.5 truncate`}
    >
      {value}
    </p>
  </div>
);

function fmtUsd(v?: number): string {
  if (v === undefined || v === null) return "--";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}
