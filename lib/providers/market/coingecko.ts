import { z } from "zod";
import {
  MarketDataProvider,
  TokenQuery,
  TimeRange,
  ProviderResult,
  TokenMarketData,
  PricePoint,
  TokenMarketDataSchema,
  ProviderCapability,
} from "../interfaces";
import { logger } from "../../observability/logger";
import { getCache } from "../../cache";

const CoinGeckoSimplePriceSchema = z.record(
  z.object({
    usd: z.number(),
    usd_24h_change: z.number().optional().default(0),
    usd_24h_vol: z.number().optional().default(0),
    usd_market_cap: z.number().optional().default(0),
    last_updated_at: z.number().optional(),
  })
);

export class CoinGeckoProvider implements MarketDataProvider {
  id = "coingecko";
  name = "CoinGecko";
  capability: ProviderCapability = "market";
  requiredEnvVars: string[] = []; // public API works without key, optional demo key

  private apiKey?: string;
  private baseUrl = "https://api.coingecko.com/api/v3";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.COINGECKO_API_KEY;
    if (this.apiKey && this.apiKey.startsWith("CG-PRO-")) {
      this.baseUrl = "https://pro-api.coingecko.com/api/v3";
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/ping`, {
        headers: this.apiKey ? { "x-cg-demo-api-key": this.apiKey } : {},
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  private mapSymbolToId(symbol: string): string {
    const s = symbol.toLowerCase();
    const map: Record<string, string> = {
      btc: "bitcoin",
      eth: "ethereum",
      sol: "solana",
      usdt: "tether",
      bnb: "binancecoin",
      xrp: "ripple",
      ada: "cardano",
      doge: "dogecoin",
      matic: "matic-network",
      pol: "polygon-ecosystem-token",
    };
    return map[s] || s;
  }

  async getTokenMarketData(query: string | TokenQuery): Promise<ProviderResult<TokenMarketData>> {
    // Normalize: accept both string and TokenQuery
    const rawSymbol = typeof query === "string" ? query : (query.symbol || "btc");
    const symbol = rawSymbol.toUpperCase();
    const coinId = this.mapSymbolToId(symbol);
    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "market_data", { coinId });

    const cached = await cache.get<TokenMarketData>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: {
          provider: this.id,
          fetchedAt: cached.lastUpdated,
        },
      };
    }

    const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_market_cap=true&include_last_updated_at=true`;
    const res = await fetch(url, {
      headers: this.apiKey ? { "x-cg-demo-api-key": this.apiKey } : {},
    });

    if (!res.ok) {
      logger.error("CoinGecko fetch failed", {
        provider: this.id,
        statusCode: res.status,
      });
      throw new Error(`CoinGecko request failed with status ${res.status}`);
    }

    const raw = await res.json();
    const parsed = CoinGeckoSimplePriceSchema.safeParse(raw);
    if (!parsed.success || !parsed.data[coinId]) {
      logger.warn("CoinGecko malformed or empty response", {
        provider: this.id,
        data: { raw },
      });
      throw new Error(`CoinGecko returned invalid data structure for coin: ${coinId}`);
    }

    const entry = parsed.data[coinId];
    const now = new Date().toISOString();
    const normalized: TokenMarketData = {
      id: coinId,
      symbol,
      name: symbol,
      priceUsd: entry.usd,
      change24h: entry.usd_24h_change,
      volume24h: entry.usd_24h_vol,
      marketCap: entry.usd_market_cap,
      lastUpdated: now,
    };

    TokenMarketDataSchema.parse(normalized);
    await cache.set(cacheKey, normalized, 30);

    return {
      data: normalized,
      source: {
        provider: this.id,
        fetchedAt: now,
      },
    };
  }

  async getMarketHistory(query: TokenQuery, range: TimeRange): Promise<ProviderResult<PricePoint[]>> {
    const symbol = (query.symbol || "btc").toUpperCase();
    const coinId = this.mapSymbolToId(symbol);
    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "market_history", { coinId, days: range.days });

    const cached = await cache.get<PricePoint[]>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: {
          provider: this.id,
          fetchedAt: new Date().toISOString(),
        },
      };
    }

    const url = `${this.baseUrl}/coins/${coinId}/market_chart?vs_currency=usd&days=${range.days}`;
    const res = await fetch(url, {
      headers: this.apiKey ? { "x-cg-demo-api-key": this.apiKey } : {},
    });

    if (!res.ok) {
      throw new Error(`CoinGecko history failed with status ${res.status}`);
    }

    const raw = (await res.json()) as { prices: [number, number][]; total_volumes: [number, number][] };
    if (!Array.isArray(raw.prices)) {
      throw new Error("CoinGecko invalid history payload");
    }

    const points: PricePoint[] = raw.prices.map(([ts, price], index) => {
      const vol = raw.total_volumes?.[index]?.[1];
      return {
        timestamp: ts,
        price,
        volume: vol,
      };
    });

    await cache.set(cacheKey, points, 300);

    return {
      data: points,
      source: {
        provider: this.id,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  async getTokenPriceHistory(
    symbol: string,
    timeframe: string = "7d"
  ): Promise<ProviderResult<PricePoint[]>> {
    let days = 7;
    if (timeframe === "24h" || timeframe === "1d") days = 1;
    else if (timeframe === "30d") days = 30;
    else if (timeframe === "90d") days = 90;
    else if (timeframe === "1y") days = 365;

    return this.getMarketHistory({ symbol }, { days });
  }
}
