"use client";

import React, { useMemo, useState } from "react";
import { Search, Star, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { CoinSummary } from "@/lib/providers/interfaces";

export interface CoinSelectorProps {
  coins: CoinSummary[];
  loading: boolean;
  loadingMore?: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (coin: CoinSummary) => void;
  selectedId?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

const MAX_VISIBLE = 120;

/**
 * Searchable coin selector listing the top 1000+ coins from CoinGecko.
 * Shows live price and 24h change for each coin, with favorites pinned on top.
 */
export const CoinSelector: React.FC<CoinSelectorProps> = ({
  coins,
  loading,
  loadingMore = false,
  error,
  search,
  onSearchChange,
  onSelect,
  selectedId,
  onLoadMore,
  hasMore = false,
}) => {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ordered = useMemo(() => {
    const favs = coins.filter((c) => favorites.has(c.id));
    const rest = coins.filter((c) => !favorites.has(c.id));
    return [...favs, ...rest];
  }, [coins, favorites]);

  const visible = ordered.slice(0, MAX_VISIBLE);

  const formatPrice = (v?: number) => {
    if (v === undefined || v === null) return "--";
    if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    return `$${v.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search 1000+ coins (BTC, ETH, SOL...)"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-1 border border-surface-border text-sm font-mono text-gray-100 placeholder-gray-500 focus:outline-none focus:border-cyan-neon/60 focus:ring-1 focus:ring-cyan-neon/30 transition-colors"
          aria-label="Search coins"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-neon animate-spin" />
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-1 mt-3 mb-1.5 text-[10px] font-mono text-gray-500 uppercase tracking-wider shrink-0">
        <span>
          {loading ? "Loading universe..." : `${coins.length} coins`}
        </span>
        <span>Price / 24h</span>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
        {error && (
          <div className="p-3 rounded-lg bg-rose-flare/10 border border-rose-flare/30 text-xs font-mono text-rose-flare">
            {error}
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="p-4 text-center text-xs font-mono text-gray-500">
            No coins match &ldquo;{search}&rdquo;
          </div>
        )}

        {visible.map((coin) => {
          const isSelected = coin.id === selectedId;
          const isFav = favorites.has(coin.id);
          const positive = (coin.change24h ?? 0) >= 0;
          return (
            <button
              key={coin.id}
              type="button"
              onClick={() => onSelect(coin)}
              className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all ${
                isSelected
                  ? "bg-cyan-neon/10 border-cyan-neon/50"
                  : "bg-surface-1/60 border-transparent hover:bg-surface-2/70 hover:border-surface-border"
              }`}
            >
              {/* Rank */}
              <span className="w-6 text-[10px] font-mono text-gray-500 text-right shrink-0">
                {coin.marketCapRank ?? "-"}
              </span>

              {/* Icon */}
              {coin.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coin.image}
                  alt={coin.name}
                  className="w-5 h-5 rounded-full shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-surface-2 border border-surface-border shrink-0" />
              )}

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono font-bold text-gray-100 truncate">
                  {coin.symbol}
                </div>
                <div className="text-[10px] font-mono text-gray-500 truncate">
                  {coin.name}
                </div>
              </div>

              {/* Price / change */}
              <div className="text-right shrink-0">
                <div className="text-xs font-mono text-gray-200">
                  {formatPrice(coin.priceUsd)}
                </div>
                <div
                  className={`text-[10px] font-mono flex items-center justify-end gap-0.5 ${
                    positive ? "text-emerald-cyber" : "text-rose-flare"
                  }`}
                >
                  {positive ? (
                    <TrendingUp className="w-2.5 h-2.5" />
                  ) : (
                    <TrendingDown className="w-2.5 h-2.5" />
                  )}
                  {positive ? "+" : ""}
                  {(coin.change24h ?? 0).toFixed(2)}%
                </div>
              </div>

              {/* Favorite */}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => toggleFavorite(coin.id, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleFavorite(coin.id, e as unknown as React.MouseEvent);
                  }
                }}
                className="p-1 rounded hover:bg-surface-2 transition-colors shrink-0"
                aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    isFav ? "text-amber-400 fill-amber-400" : "text-gray-600"
                  }`}
                />
              </span>
            </button>
          );
        })}

        {hasMore && !search && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full mt-2 py-2 rounded-lg bg-surface-1 border border-surface-border text-xs font-mono text-cyan-neon hover:bg-surface-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading more...
              </>
            ) : (
              "Load 250 more coins"
            )}
          </button>
        )}
      </div>
    </div>
  );
};
