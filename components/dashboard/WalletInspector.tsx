"use client";

import React, { useState } from "react";
import { WalletBalance, Transaction } from "@/lib/providers/interfaces";

export const WalletInspector: React.FC = () => {
  const [address, setAddress] = useState("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  const [network, setNetwork] = useState("ethereum");
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sampleAddresses = [
    { label: "Vitalik (EVM)", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", net: "ethereum" },
    { label: "Binance 14 (EVM)", address: "0x28C6c06298d514Db089934071355E5743bf21d60", net: "ethereum" },
  ];

  const handleInspect = async (targetAddr?: string, targetNet?: string) => {
    const addr = targetAddr || address;
    const net = targetNet || network;
    if (!addr.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallet?address=${encodeURIComponent(addr)}&network=${net}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP Error ${res.status}`);
      }
      const data = await res.json();
      setBalance(data.balance);
      setTransactions(data.transactions || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to query on-chain wallet data");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-4 space-y-4">
      {/* Search Header */}
      <div className="p-5 rounded-xl glass-hud border border-surface-border">
        <h2 className="text-lg font-bold font-mono text-cyan-neon mb-2">
          ON-CHAIN WALLET & LEDGER INSPECTOR
        </h2>
        <p className="text-xs text-gray-400 font-mono mb-4">
          Query EVM & Solana balances, ERC20/SPL tokens, and real-time transaction activity.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleInspect();
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-surface-1 border border-surface-border text-xs font-mono text-gray-200 outline-none focus:border-cyan-neon"
          >
            <option value="ethereum">Ethereum (Mainnet)</option>
            <option value="polygon">Polygon</option>
            <option value="arbitrum">Arbitrum</option>
            <option value="solana">Solana</option>
          </select>

          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter EVM (0x...) or Solana base58 address"
            className="flex-1 px-4 py-2.5 rounded-xl bg-surface-1 border border-surface-border focus:border-cyan-neon outline-none text-xs font-mono text-gray-100 placeholder-gray-500"
          />

          <button
            type="submit"
            disabled={isLoading || !address.trim()}
            className="px-5 py-2.5 rounded-xl bg-cyan-neon/10 hover:bg-cyan-neon/20 border border-cyan-neon text-cyan-neon font-mono text-xs font-semibold tracking-wider transition-all disabled:opacity-50"
          >
            {isLoading ? "SCANNING..." : "INSPECT"}
          </button>
        </form>

        {/* Quick Sample Address Pills */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-surface-border/40">
          <span className="text-[11px] font-mono text-gray-400">Presets:</span>
          {sampleAddresses.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setAddress(s.address);
                setNetwork(s.net);
                handleInspect(s.address, s.net);
              }}
              className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-1 hover:bg-surface-2 border border-surface-border text-gray-300 hover:text-cyan-neon transition-all"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-flare/10 border border-rose-flare/30 text-rose-flare text-xs font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Results View */}
      {balance && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Balance Card */}
          <div className="p-5 rounded-xl glass-hud border border-surface-border">
            <span className="text-xs font-mono text-gray-400 uppercase">Native Asset Balance</span>
            <div className="text-2xl font-mono font-bold text-cyan-neon mt-2">
              {balance.nativeBalance} {balance.nativeSymbol}
            </div>
            {balance.usdValue !== undefined && (
              <p className="text-xs font-mono text-emerald-cyber mt-1">
                ≈ ${balance.usdValue.toLocaleString()} USD
              </p>
            )}
            <div className="mt-4 pt-3 border-t border-surface-border/40">
              <span className="text-[11px] font-mono text-gray-400">Network:</span>
              <span className="ml-2 text-xs font-mono text-gray-200 uppercase">{network}</span>
            </div>

            {/* Token list if present */}
            {balance.tokens && balance.tokens.length > 0 && (
              <div className="mt-4 pt-3 border-t border-surface-border/40">
                <span className="text-[11px] font-mono text-gray-400 uppercase">Tokens:</span>
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {balance.tokens.map((t, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] font-mono">
                      <span className="text-gray-300">{t.symbol}</span>
                      <span className="text-cyan-glow">{t.balanceFormatted}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Transactions List Card */}
          <div className="md:col-span-2 p-5 rounded-xl glass-hud border border-surface-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-mono font-bold text-gray-200">
                RECENT TRANSACTIONS ({transactions.length})
              </h3>
              <span className="text-[11px] font-mono text-gray-400">Confirmed</span>
            </div>

            {transactions.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-gray-500">
                No recent transactions detected for this address.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {transactions.map((tx, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-surface-1 border border-surface-border text-xs font-mono flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-cyan-glow font-semibold truncate max-w-xs sm:max-w-sm">
                        {tx.hash}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {tx.from.slice(0, 8)}...{tx.from.slice(-6)} ➔ {tx.to ? `${tx.to.slice(0, 8)}...${tx.to.slice(-6)}` : "Contract Creation"}
                      </div>
                    </div>

                    <div className="sm:text-right">
                      <div className="text-gray-200 font-semibold">{tx.value}</div>
                      <div className="text-[10px] text-gray-500">
                        {new Date(tx.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};