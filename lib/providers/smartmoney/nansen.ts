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
 * Nansen "Smart Money" adapter.
 *
 * Endpoints (see https://docs.nansen.ai/api/smart-money):
 *   POST https://api.nansen.ai/api/v1/smart-money/holdings
 *   POST https://api.nansen.ai/api/v1/smart-money/netflows
 * Auth: `apiKey: <key>` header.
 *
 * Nansen labels wallets by behaviour (Fund, Smart Trader, 30D Smart Trader,
 * Whale, ...). The API reports AGGLREGATE exposure per token, not raw wallets,
 * so we never claim to know an individual wallet's identity — see the tool
 * descriptions, which tell the model exactly that.
 *
 * Requires a paid Nansen API plan; with no key the provider reports itself as
 * unconfigured and the registry simply has no smart-money capability. It never
 * fabricates data (see the project-wide data-integrity policy).
 */

const CHAIN_ALIASES: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  bnb: "bnb",
  bsc: "bnb",
  base: "base",
  arbitrum: "arbitrum",
  polygon: "polygon",
  optimism: "optimism",
  avalanche: "avalanche",
};

function normalizeChain(chain: string): string {
  return CHAIN_ALIASES[chain.toLowerCase()] ?? chain.toLowerCase();
}

interface NansenApiResponse {
  data?: NansenHoldingRow[];
  pagination?: { page: number; per_page: number; is_last_page: boolean };
  message?: string;
  error?: string;
}

interface NansenHoldingRow {
  chain?: string;
  token_address?: string;
  token_symbol?: string;
  token_sectors?: string[] | string;
  value_usd?: number;
  value_usd_change_24h?: number;
  balance_24h_percent_change?: number;
  holders_count?: number;
  share_of_holdings_percent?: number;
  token_age_days?: number;
  market_cap_usd?: number;
}

export class NansenProvider implements SmartMoneyProvider {
  id = "nansen";
  name = "Nansen Smart Money";
  capability: ProviderCapability = "smart-money";
  requiredEnvVars = ["NANSEN_API_KEY"];

  supportedNetworks = ["ethereum", "solana", "base", "arbitrum", "polygon", "bnb"];
  supportedChains = this.supportedNetworks;

  private apiKey?: string;
  private baseUrl = "https://api.nansen.ai/api/v1";

  /** Nansen's documented smart-money cohorts, mapped to its filter values. */
  private readonly smartMoneyFilters: string[] = ["smart_money"];

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getSecret("NANSEN_API_KEY");
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      // Cheapest authenticated call that proves the key is valid.
      const res = await fetch(`${this.baseUrl}/smart-money/holdings`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          chains: ["ethereum"],
          filters: { include_smart_money_labels: this.smartMoneyFilters },
          pagination: { page: 1, per_page: 1 },
          order_by: [{ field: "value_usd", direction: "DESC" }],
        }),
      });
      // 401/403 => bad key; anything 2xx means the endpoint is reachable.
      return res.ok;
    } catch {
      return false;
    }
  }

  private headers(): Record<string, string> {
    return {
      apiKey: this.apiKey as string,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private requireKey(): string {
    if (!this.apiKey) {
      throw new Error(
        "Nansen API key is not configured. Set NANSEN_API_KEY to query smart-money flows."
      );
    }
    return this.apiKey;
  }

  /**
   * POST helper with a hard timeout. Nansen queries can be slow, and a hung
   * upstream must not stall the agent loop.
   */
  private async post(path: string, body: Record<string, unknown>): Promise<NansenApiResponse> {
    this.requireKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "Nansen rejected the API key (401/403). The Smart Money endpoints require a paid Nansen API plan."
        );
      }
      if (res.status === 429) {
        throw new Error("Nansen rate limit reached (429). Retry shortly.");
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.warn("Nansen request failed", {
          provider: this.id,
          statusCode: res.status,
          data: { path, error: text.slice(0, 300) },
        });
        throw new Error(`Nansen request failed with status ${res.status}`);
      }
      return (await res.json()) as NansenApiResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildQuery(query: SmartMoneyQuery = {}): Record<string, unknown> {
    const chains = (query.chains?.length ? query.chains : ["ethereum", "solana", "base"]).map(
      normalizeChain
    );
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const filters: Record<string, unknown> = {
      include_smart_money_labels: this.smartMoneyFilters,
    };
    // Nansen filters token lists under `filters`, not at the top level.
    if (query.tokenAddresses?.length) filters.token_addresses = query.tokenAddresses;
    if (query.tokenSymbols?.length) filters.token_symbols = query.tokenSymbols;
    if (query.minValueUsd !== undefined) filters.include_value_usd = query.minValueUsd;

    return {
      chains,
      filters,
      pagination: { page: 1, per_page: limit },
      order_by: [{ field: "value_usd", direction: "DESC" }],
    };
  }

  private mapSectors(raw: string[] | string | undefined): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async getSmartMoneyHoldings(
    query?: SmartMoneyQuery
  ): Promise<ProviderResult<SmartMoneyHolding[]>> {
    const requestBody = this.buildQuery(query);
    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "holdings", requestBody as Record<string, unknown>);

    const cached = await cache.get<SmartMoneyHolding[]>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: { provider: this.id, fetchedAt: new Date().toISOString() },
      };
    }

    const json = await this.post("/smart-money/holdings", requestBody);
    const rows = Array.isArray(json.data) ? json.data : [];

    const holdings: SmartMoneyHolding[] = rows
      .filter((r) => typeof r.value_usd === "number")
      .map((r) => ({
        chain: normalizeChain(r.chain || "ethereum"),
        tokenAddress: r.token_address || "",
        tokenSymbol: (r.token_symbol || "?").toUpperCase(),
        sectors: this.mapSectors(r.token_sectors),
        valueUsd: r.value_usd as number,
        balance24hPercentChange: r.balance_24h_percent_change,
        holdersCount: r.holders_count,
        shareOfHoldingsPercent: r.share_of_holdings_percent,
        tokenAgeDays: r.token_age_days,
        marketCapUsd: r.market_cap_usd,
      }));

    // 2 minutes: smart-money holdings move far slower than spot price, and the
    // free tier's request budget is the binding constraint.
    await cache.set(cacheKey, holdings, 120);

    return {
      data: holdings,
      source: { provider: this.id, fetchedAt: new Date().toISOString() },
    };
  }

  /**
   * Net token flows for the same smart-money cohort.
   *
   * Nansen exposes this at `/smart-money/netflows` with the same envelope as
   * holdings (chain, token_address, token_symbol, net_flow_*). Field names are
   * mapped defensively because the payload is plan/version dependent — a row
   * without a finite USD figure is dropped, never coerced to 0.
   */
  async getSmartMoneyNetflows(
    query?: SmartMoneyQuery
  ): Promise<ProviderResult<SmartMoneyNetflow[]>> {
    const requestBody = this.buildQuery(query);
    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "netflows", requestBody as Record<string, unknown>);

    const cached = await cache.get<SmartMoneyNetflow[]>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: { provider: this.id, fetchedAt: new Date().toISOString() },
      };
    }

    const json = await this.post("/smart-money/netflows", requestBody);
    const rows = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : [];

    const num = (v: unknown): number | undefined =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;

    const netflows: SmartMoneyNetflow[] = rows
      .map((r) => {
        const netflow =
          num(r.net_flow_24h_usd) ??
          num(r.net_flow_usd) ??
          num(r.netflow_usd) ??
          num(r.value_usd);
        return {
          chain: normalizeChain(String(r.chain || "ethereum")),
          tokenAddress: String(r.token_address || ""),
          tokenSymbol: r.token_symbol ? String(r.token_symbol).toUpperCase() : undefined,
          netflowUsd: netflow as number,
          netflow24hChangePercent:
            num(r.net_flow_24h_change_percent) ?? num(r.balance_24h_percent_change),
          tradersCount: num(r.traders_count) ?? num(r.holders_count),
        };
      })
      .filter((n) => Number.isFinite(n.netflowUsd));

    await cache.set(cacheKey, netflows, 120);

    return {
      data: netflows,
      source: { provider: this.id, fetchedAt: new Date().toISOString() },
    };
  }

  /**
   * Transfers made by ONE labelled wallet.
   *
   * Nansen exposes these under `/profiler/address/transactions` (many plans
   * gate it) — a different shape from the cohort endpoints: a flat list of
   * transfers with `from_address` / `to_address`. Rows are mapped defensively
   * and rows without a finite USD value are dropped, never zero-filled.
   */
  async getSmartMoneyWalletFlows(query: {
    wallet: string;
    direction?: "inflow" | "outflow" | "all";
    chain?: string;
    limit?: number;
  }): Promise<ProviderResult<SmartMoneyWalletFlow[]>> {
    const wallet = query.wallet.trim();
    if (!wallet) throw new Error("A wallet address is required.");

    const chain = normalizeChain(query.chain || "ethereum");
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const direction = query.direction || "all";

    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "wallet_flows", { wallet, chain, direction, limit });
    const cached = await cache.get<SmartMoneyWalletFlow[]>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: { provider: this.id, fetchedAt: new Date().toISOString() },
      };
    }

    const json = await this.post("/profiler/address/transactions", {
      address: wallet,
      chain,
      pagination: { page: 1, per_page: limit },
    });

    const rows = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : [];
    const num = (v: unknown): number | undefined =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;
    const isIncoming = (r: Record<string, unknown>) =>
      String(r.to_address ?? "").toLowerCase() === wallet.toLowerCase();

    const flows: SmartMoneyWalletFlow[] = [];
    for (const r of rows) {
      const usd = num(r.value_usd) ?? num(r.volume_usd) ?? num(r.token_value_usd);
      if (usd === undefined) continue;

      const incoming = isIncoming(r);
      const flowDirection: "inflow" | "outflow" = incoming ? "inflow" : "outflow";
      if (direction !== "all" && direction !== flowDirection) continue;

      const rawTime = r.block_timestamp ?? r.timestamp ?? r.block_time;
      const timestamp =
        typeof rawTime === "number"
          ? new Date(rawTime > 1e12 ? rawTime : rawTime * 1000).toISOString()
          : typeof rawTime === "string"
            ? rawTime
            : undefined;

      flows.push({
        wallet,
        chain,
        tokenSymbol: r.token_symbol ? String(r.token_symbol).toUpperCase() : undefined,
        tokenAddress: r.token_address ? String(r.token_address) : undefined,
        valueUsd: incoming ? usd : -usd,
        direction: flowDirection,
        counterparty: incoming
          ? (r.from_address as string | undefined)
          : (r.to_address as string | undefined),
        timestamp,
      });
    }

    await cache.set(cacheKey, flows, 120);

    return {
      data: flows,
      source: { provider: this.id, fetchedAt: new Date().toISOString() },
    };
  }
}

export { normalizeChain as normalizeNansenChain };
