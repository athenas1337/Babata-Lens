import {
  SmartMoneyProvider,
  SmartMoneyQuery,
  SmartMoneyHolding,
  SmartMoneyNetflow,
  SmartMoneyWalletFlow,
  ProviderResult,
  ProviderCapability,
} from "../interfaces";
import { getSecret } from "../../config/env";
import { getCache } from "../../cache";
import { logger } from "../../observability/logger";

/**
 * Free on-chain distribution proxy for "smart money" intelligence.
 *
 * Nansen labels wallets; this adapter does NOT. It measures only facts public
 * endpoints actually provide, and reports which tier of measurement it used via
 * `measurement` so the UI can never present a proxy as labelled cohorts:
 *
 *   "holders-exact"  — Moralis top-holders endpoint: true share of total supply
 *                      held by the top N addresses (free plan available).
 *   "holders-partial" — only a top-listing is reachable: percentage is computed
 *                      against the listed holders, NOT total supply, and is
 *                      therefore an upper bound. Labelled as partial everywhere.
 *
 * Etherscan's own holder endpoints (`tokenholderlist` / `topholders`) are PRO
 * endpoints (Standard plan and above) so they cannot back a free tier; only
 * Moralis is used for holder data here.
 */

const CHAINS = ["ethereum", "polygon", "arbitrum", "optimism", "base"];

/** Moralis chain identifiers differ from ours. */
const MORALIS_CHAIN: Record<string, string> = {
  ethereum: "eth",
  polygon: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  base: "base",
};

/**
 * A small, real watchlist (major ERC-20s). Deliberately NOT a "smart money"
 * claim: these are liquid majors whose float concentration is meaningful.
 */
const WATCHLIST: { symbol: string; address: string; chain: string; decimals: number }[] = [
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", chain: "ethereum", decimals: 6 },
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", chain: "ethereum", decimals: 6 },
  { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", chain: "ethereum", decimals: 18 },
  { symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", chain: "ethereum", decimals: 18 },
  { symbol: "ARB", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", chain: "arbitrum", decimals: 18 },
];

export type ConcentrationMeasurement = "holders-exact" | "holders-partial";

interface OwnerRow {
  owner_address?: string;
  balance?: string;
  percentage_relative_to_total_supply?: number;
  percentage_relative_to_total_supply_formatted?: string;
  is_contract?: boolean;
}

export class ConcentrationProxyProvider implements SmartMoneyProvider {
  id = "concentration-proxy";
  name = "On-chain Distribution Proxy";
  capability: ProviderCapability = "smart-money";
  requiredEnvVars: string[] = [];
  supportedChains = CHAINS;
  /** Consumers must render this differently from a labelling provider. */
  readonly isProxy = true;

  private moralisKey?: string;
  private moralisBase = "https://deep-index.moralis.io/api/v2.2";

  constructor(moralisKey?: string) {
    this.moralisKey = moralisKey || getSecret("MORALIS_API_KEY");
  }

  /** Keyless provider: always "up", but exactness depends on MORALIS_API_KEY. */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  hasExactHolders(): boolean {
    return Boolean(this.moralisKey);
  }

  /**
   * Top holders via Moralis. Returns null when no key is configured so the
   * caller can decide what to do instead of silently degrading.
   */
  private async fetchOwners(
    tokenAddress: string,
    chain: string,
    limit: number
  ): Promise<OwnerRow[] | null> {
    if (!this.moralisKey) return null;
    const moralisChain = MORALIS_CHAIN[chain] ?? "eth";

    const url =
      `${this.moralisBase}/erc20/${tokenAddress}/owners` +
      `?chain=${encodeURIComponent(moralisChain)}&order=DESC&limit=${limit}`;

    const res = await fetch(url, {
      headers: { accept: "application/json", "X-API-Key": this.moralisKey },
    });

    if (res.status === 401 || res.status === 402 || res.status === 403) {
      throw new Error(
        "Moralis rejected MORALIS_API_KEY (401/402/403). Check the key and its free-tier quota."
      );
    }
    if (res.status === 429) {
      throw new Error("Moralis rate limit reached (429). Retry shortly.");
    }
    if (!res.ok) {
      throw new Error(`Moralis owners query failed with status ${res.status}`);
    }

    const json = (await res.json()) as { result?: OwnerRow[] };
    return Array.isArray(json.result) ? json.result : [];
  }

  /**
   * Compute concentration for one token.
   *
   * Returns null (not zero!) when no measurement can be made — the caller must
   * skip the row rather than report a fake score.
   */
  private async measure(
    token: { symbol: string; address: string; chain: string },
    limit: number,
    measurement: ConcentrationMeasurement
  ): Promise<{ topPercent: number; holders: number; topAddresses: string[] } | null> {
    const rows = await this.fetchOwners(token.address, token.chain, limit);
    if (!rows || rows.length === 0) return null;

    const topAddresses = rows
      .slice(0, 10)
      .map((r) => r.owner_address || "")
      .filter(Boolean);

    if (measurement === "holders-exact") {
      // Moralis already gives us share-of-total-supply per holder.
      const exact = rows.every(
        (r) => typeof r.percentage_relative_to_total_supply === "number"
      );
      if (!exact) {
        // Fall through to the partial calculation rather than mislabeling.
        logger.warn("Moralis response missing exact percentages", {
          provider: this.id,
          data: { token: token.symbol },
        });
      } else {
        const top10 = rows
          .slice(0, 10)
          .reduce((sum, r) => sum + (r.percentage_relative_to_total_supply ?? 0), 0);
        return {
          topPercent: Number(top10.toFixed(2)),
          holders: rows.length,
          topAddresses,
        };
      }
    }

    // Partial: percentage of the LISTED holders only. An upper bound on the true
    // share, and reported as such.
    const balances = rows.map((r) => {
      try {
        return Number(BigInt(r.balance || "0"));
      } catch {
        return 0;
      }
    });
    const listedTotal = balances.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(listedTotal) || listedTotal <= 0) return null;
    const top10 = balances.slice(0, 10).reduce((a, b) => a + b, 0);

    return {
      topPercent: Number(((top10 / listedTotal) * 100).toFixed(2)),
      holders: rows.length,
      topAddresses,
    };
  }

  async getSmartMoneyHoldings(
    query?: SmartMoneyQuery
  ): Promise<ProviderResult<SmartMoneyHolding[]>> {
    const measurement: ConcentrationMeasurement = this.hasExactHolders()
      ? "holders-exact"
      : "holders-partial";

    const chains = query?.chains?.length ? query.chains.filter((c) => CHAINS.includes(c)) : CHAINS;
    const limit = Math.min(Math.max(query?.limit ?? 10, 1), 20);
    const perToken = 20;

    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "holdings", { chains, limit, measurement });
    const cached = await cache.get<SmartMoneyHolding[]>(cacheKey);
    const source = {
      provider: this.id,
      fetchedAt: new Date().toISOString(),
      requestId: measurement.toUpperCase(),
    };
    if (cached) return { data: cached, source };

    if (measurement === "holders-partial") {
      // No holder data is reachable for free, so report that honestly instead of
      // publishing a ranking built from unrelated numbers.
      throw new Error(
        "Free holder data requires MORALIS_API_KEY. Without it this deployment cannot measure " +
        "supply concentration, and it will not publish an unmeasured score. Set a free " +
        "Moralis key, or NANSEN_API_KEY for labelled smart-money cohorts."
      );
    }

    const targets = WATCHLIST.filter((t) => chains.includes(t.chain)).slice(0, limit);
    if (targets.length === 0) return { data: [], source };

    const results = await Promise.allSettled(
      targets.map((t) => this.measure(t, perToken, measurement).then((m) => ({ token: t, m })))
    );

    const holdings: SmartMoneyHolding[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value.m) continue;
      const { token, m } = r.value;
      holdings.push({
        chain: token.chain,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        sectors: ["distribution-proxy"],
        // `valueUsd` carries the concentration SCORE (percent points) for this
        // proxy — the tool description and UI both state that explicitly.
        valueUsd: m.topPercent,
        holdersCount: m.holders,
        shareOfHoldingsPercent: m.topPercent,
      });
    }

    if (holdings.length === 0) {
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      throw new Error(
        first
          ? String(first.reason)
          : "No holder data returned for the watchlist on the selected chains."
      );
    }

    holdings.sort((a, b) => b.valueUsd - a.valueUsd);
    await cache.set(cacheKey, holdings, 300);
    return { data: holdings, source };
  }

  async getSmartMoneyNetflows(_query?: SmartMoneyQuery): Promise<ProviderResult<SmartMoneyNetflow[]>> {
    throw new Error(
      "Net flow attribution requires a labelled-wallet provider. Set NANSEN_API_KEY. " +
      "The on-chain proxy measures concentration only and does not estimate flows."
    );
  }

  async getSmartMoneyWalletFlows(_query: {
    wallet: string;
    direction?: "inflow" | "outflow" | "all";
    chain?: string;
    limit?: number;
  }): Promise<ProviderResult<SmartMoneyWalletFlow[]>> {
    throw new Error(
      "Wallet-level flows require a labelled-wallet provider (NANSEN_API_KEY). " +
      "Use get_wallet_transactions for raw transfer history instead."
    );
  }
}
