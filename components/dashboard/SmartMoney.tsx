"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, TrendingUp, TrendingDown, KeyRound, Info } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

type View = "holdings" | "netflows";

interface HoldingRow {
  chain: string;
  tokenAddress: string;
  tokenSymbol: string;
  sectors?: string[];
  valueUsd: number;
  balance24hPercentChange?: number;
  holdersCount?: number;
  shareOfHoldingsPercent?: number;
  marketCapUsd?: number;
}

interface NetflowRow {
  chain: string;
  tokenAddress: string;
  tokenSymbol?: string;
  netflowUsd: number;
  netflow24hChangePercent?: number;
  tradersCount?: number;
}

interface SmartMoneyResponse {
  configured: boolean;
  view: View;
  data: (HoldingRow | NetflowRow)[];
  provider?: string;
  message?: string;
  chains?: string[];
  source?: { provider: string; fetchedAt: string };
  /** True when the numbers are measured on-chain, not Nansen-labelled cohorts. */
  proxy?: boolean;
  unlock?: { envVar: string; label: string; note: string };
}

const CHAINS = [
  { id: "", label: "All chains" },
  { id: "ethereum", label: "Ethereum" },
  { id: "solana", label: "Solana" },
  { id: "base", label: "Base" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "polygon", label: "Polygon" },
  { id: "bnb", label: "BNB" },
];

/**
 * SmartMoney — labelled-wallet ("smart money") positioning.
 *
 * Honesty contract: this panel shows AGGREGATED cohort data from a labelling
 * provider. It never names an individual wallet as "the smart money" and never
 * invents numbers when the provider is unconfigured.
 */
export const SmartMoney: React.FC = () => {
  const [view, setView] = useState<View>("holdings");
  const [chain, setChain] = useState("");
  const [rows, setRows] = useState<(HoldingRow | NetflowRow)[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [isProxy, setIsProxy] = useState(false);
  const [unlock, setUnlock] = useState<SmartMoneyResponse["unlock"]>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams({ view, limit: "25" });
      if (chain) params.set("chain", chain);
      const res = await apiFetch(`/api/smart-money?${params.toString()}`);
      const data = (await res.json()) as SmartMoneyResponse & { error?: string };

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setConfigured(Boolean(data.configured));
      setRows(data.data || []);
      setMessage(data.message ?? null);
      setProvider(data.provider ?? "");
      setIsProxy(Boolean(data.proxy));
      setUnlock(data.unlock);
      setFetchedAt(data.source?.fetchedAt ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load smart-money data");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [view, chain]);

  useEffect(() => {
    void load();
  }, [load]);

  const isNetflow = view === "netflows";

  return (
    <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 py-4 space-y-4">
      {/* Header */}
      <div className="p-5 rounded-xl glass-hud border-surface-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold font-mono text-cyan-neon">SMART MONEY INTELLIGENCE</h2>
            <p className="text-xs text-gray-400 font-mono mt-1 max-w-2xl leading-relaxed">
              {isProxy ? (
                <>
                  On-chain measurement of how concentrated each token&rsquo;s supply is.{" "}
                  <span className="text-amber-glow">This is a distribution proxy, not labelled
                  smart-money cohorts</span> — no wallet is identified as a &ldquo;smart trader&rdquo;.
                </>
              ) : (
                <>
                  What labelled &ldquo;smart money&rdquo; wallets are holding and whether they are net
                  buyers or sellers. Values are <span className="text-gray-200">aggregated across a
                    cohort of wallets</span> — not one identifiable trader.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="self-start px-3 py-1.5 rounded-lg bg-surface-1 hover:bg-surface-2 border-surface-border text-xs font-mono text-cyan-glow hover:text-cyan-neon transition-all flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            REFRESH
          </button>
        </div>

        {/* Controls */}
        <div className="mt-4 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-1 border-surface-border">
            {(["holdings", "netflows"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded text-xs font-mono transition-all ${view === v
                    ? "bg-cyan-neon/20 text-cyan-neon font-bold"
                    : "text-gray-400 hover:text-gray-200"
                  }`}
              >
                {v === "holdings" ? "Holdings" : "Net flows"}
              </button>
            ))}
          </div>

          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface-1 border-surface-border text-xs font-mono text-gray-200 outline-none focus:border-cyan-neon"
          >
            {CHAINS.map((c) => (
              <option key={c.id || "all"} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          {fetchedAt && (
            <span className="text-[11px] font-mono text-gray-500 ml-auto">
              {provider && <span className="text-gray-400">{provider} · </span>}
              {new Date(fetchedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Not configured */}
      {configured === false && (
        <div className="p-5 rounded-xl bg-surface-1/60 border-dashed border-surface-border">
          <div className="flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-cyan-neon mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-mono font-bold text-gray-100">
                Smart-money tracking is not enabled
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed mt-1">{message}</p>
              <div className="mt-3 flex-wrap gap-2 text-[11px] font-mono">
                <span className="px-2 py-1 rounded bg-cyan-neon/10 border-cyan-neon/30 text-cyan-glow">
                  FREE · <code>MORALIS_API_KEY</code> → holder concentration
                </span>
                <span className="px-2 py-1 rounded bg-surface-2 border-surface-border text-gray-300">
                  PAID · <code>NANSEN_API_KEY</code> → labelled cohorts + net flows
                </span>
              </div>
              <p className="text-[11px] font-mono text-gray-500 mt-2 leading-relaxed">
                Set either in Vercel → Settings → Environment Variables, then redeploy.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Proxy disclosure: never let measured concentration read as Nansen labels */}
      {configured && isProxy && (
        <div className="p-4 rounded-xl bg-amber-glow/10 border-amber-glow/40 text-xs font-mono leading-relaxed">
          <div className="flex items-start gap-2 text-amber-glow">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <strong>This is an on-chain proxy, not Nansen smart-money labels.</strong>{" "}
              {view === "holdings"
                ? "Values are the share of each token's supply held by its top 10 addresses (measured via Etherscan), sorted by concentration. High concentration means fewer wallets control the float — a distribution-risk signal, not a buy signal."
                : "Net flows require a labelled-wallet provider and are unavailable on the free proxy."}
              {unlock && (
                <div className="mt-2 text-gray-300">
                  Unlock labelled cohorts and net flows with <code className="text-cyan-glow">{unlock.envVar}</code> — {unlock.note}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-flare/10 border-rose-flare/30 text-rose-flare text-xs font-mono">
          ⚠ {error}
        </div>
      )}

      {/* Table */}
      {configured && (
        <div className="rounded-xl glass-hud border-surface-border overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-surface-border/60 text-[10px] font-mono uppercase tracking-wider text-gray-500">
            <span className="col-span-1">#</span>
            <span className="col-span-3">Token</span>
            <span className="col-span-2">Chain</span>
            <span className="col-span-3 text-right">
              {isNetflow ? "Net flow (USD)" : isProxy ? "Top-10 concentration" : "Smart money value"}
            </span>
            <span className="col-span-3 text-right">
              {isNetflow ? "Traders" : "24h balance change"}
            </span>
          </div>

          {loading && rows.length === 0 && (
            <div className="py-12 flex items-center justify-center gap-2 text-xs font-mono text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Querying labelled-wallet data…
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="py-12 text-center text-xs font-mono text-gray-500">
              No rows returned for this chain/view.
            </div>
          )}

          {rows.map((row, idx) => {
            const holding = row as HoldingRow;
            const netflow = row as NetflowRow;
            const symbol = holding.tokenSymbol || netflow.tokenSymbol || "?";
            const primaryValue = isNetflow ? netflow.netflowUsd : holding.valueUsd;
            const secondary = isNetflow
              ? netflow.tradersCount
              : holding.balance24hPercentChange;
            const positive = isNetflow ? primaryValue >= 0 : (secondary ?? 0) >= 0;

            return (
              <div
                key={`${row.chain}-${row.tokenAddress}-${idx}`}
                className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-surface-border/30 last:border-0 text-xs font-mono hover:bg-surface-1/60 transition-colors items-center"
              >
                <span className="col-span-1 text-gray-500">{idx + 1}</span>
                <span className="col-span-3 text-gray-100 font-bold truncate">{symbol}</span>
                <span className="col-span-2 text-gray-400 uppercase text-[10px]">{row.chain}</span>
                <span
                  className={`col-span-3 text-right font-semibold flex items-center justify-end gap-1 ${positive ? "text-emerald-cyber" : "text-rose-flare"
                    }`}
                >
                  {isNetflow &&
                    (positive ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    ))}
                  {fmtUsd(primaryValue)}
                </span>
                <span className="col-span-3 text-right text-gray-400">
                  {typeof secondary === "number"
                    ? `${secondary >= 0 ? "+" : ""}${secondary.toFixed(1)}${isNetflow ? "" : "%"}`
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Method note */}
      <div className="flex items-start gap-2 text-[11px] font-mono text-gray-500 leading-relaxed">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Labels (e.g. &ldquo;Smart Trader&rdquo;, &ldquo;Fund&rdquo;) come from the data provider,
          not from this app. Treat cohort flows as a crowding signal, not as proof of insider
          activity, and verify token contracts independently before acting.
        </span>
      </div>
    </div>
  );
};

function fmtUsd(v?: number): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}
