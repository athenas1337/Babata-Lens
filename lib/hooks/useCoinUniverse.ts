"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoinSummary } from "@/lib/providers/interfaces";
import { apiFetch } from "@/lib/api/client";

export interface UseCoinUniverseResult {
  /** All loaded coins across fetched pages. */
  coins: CoinSummary[];
  /** Coins matching the current search term (client-side filtered). */
  filtered: CoinSummary[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  /** Load the next page of coins (pagination). */
  loadMore: () => void;
  hasMore: boolean;
  refresh: () => void;
  source: { provider: string; fetchedAt: string } | null;
}

const PAGE_SIZE = 250;
const MAX_PAGES = 4; // ~1000 coins

/**
 * Loads the top ~1000 coins from /api/coins with pagination, caching, and
 * client-side search. Keeps the network footprint low while giving the UI an
 * instantly-searchable universe.
 */
export function useCoinUniverse(): UseCoinUniverseResult {
  const [coins, setCoins] = useState<CoinSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [source, setSource] = useState<{ provider: string; fetchedAt: string } | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const fetchPage = useCallback(async (pageToFetch: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiFetch(
        `/api/coins?page=${pageToFetch}&perPage=${PAGE_SIZE}&order=market_cap_desc`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        coins: CoinSummary[];
        source: { provider: string; fetchedAt: string };
      };

      const incoming = Array.isArray(data.coins) ? data.coins : [];
      setSource(data.source ?? null);

      if (append) {
        const unique = incoming.filter((c) => {
          if (seenIds.current.has(c.id)) return false;
          seenIds.current.add(c.id);
          return true;
        });
        setCoins((prev) => [...prev, ...unique]);
      } else {
        seenIds.current = new Set(incoming.map((c) => c.id));
        setCoins(incoming);
      }

      setHasMore(incoming.length >= PAGE_SIZE && pageToFetch < MAX_PAGES);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coin universe");
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    void fetchPage(next, true);
  }, [page, hasMore, loading, loadingMore, fetchPage]);

  const refresh = useCallback(() => {
    setPage(1);
    setHasMore(true);
    seenIds.current = new Set();
    void fetchPage(1, false);
  }, [fetchPage]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return coins;
    return coins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term)
    );
  }, [coins, search]);

  return {
    coins,
    filtered,
    loading,
    loadingMore,
    error,
    search,
    setSearch,
    loadMore,
    hasMore,
    refresh,
    source,
  };
}
