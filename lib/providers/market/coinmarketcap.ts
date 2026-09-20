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

const CmcQuoteSchema = z.object({
  data: z.record(
    z.object({
      id: z.number(),
      name: z.string(),
      symbol: z.string(),
      quote: z.object({
        USD: z.object({
          price: z.number(),
          percent_change_24h: z.number().nullable().optional(),
          volume_24h: z.number().nullable().optional(),
          market_cap: z.number().nullable().optional(),
          last_updated: z.string(),
        }),
      }),
    })
  ),
});

export class CoinMarketCapProvider implements MarketDataProvider {
  id = "coinmarketcap";
  name = "CoinMarketCap";
  capability: ProviderCapability = "market";
  requiredEnvVars = ["COINMARKETCAP_API_KEY"];

  private apiKey?: string;
  private baseUrl = "https://pro-api.coinmarketcap.com/v1";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.COINMARKETCAP_API_KEY;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/key/info`, {
        headers: { "X-CMC_PRO_API_KEY": this.apiKey },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getTokenMarketData(query: string | TokenQuery): Promise<ProviderResult<TokenMarketData>> {
    // Normalize: accept both string and TokenQuery
    const rawSymbol = typeof query === "string" ? query : (query.symbol || "BTC");
    const symbol = rawSymbol.toUpperCase();
    if (!this.apiKey) {
      throw new Error("CoinMarketCap API key is not configured.");
    }

    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "market_data", { symbol });
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

    const url = `${this.baseUrl}/cryptocurrency/quotes/latest?symbol=${symbol}`;
    const res = await fetch(url, {
      headers: { "X-CMC_PRO_API_KEY": this.apiKey },
    });

    if (!res.ok) {
      logger.error("CoinMarketCap fetch failed", {
        provider: this.id,
        statusCode: res.status,
      });
      throw new Error(`CoinMarketCap request failed with status ${res.status}`);
    }

    const raw = await res.json();
    const parsed = CmcQuoteSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.data[symbol]) {
      logger.warn("CoinMarketCap malformed response", { provider: this.id, data: { raw } });
      throw new Error(`CoinMarketCap returned invalid data for symbol: ${symbol}`);
    }

    const item = parsed.data.data[symbol];
    const usd = item.quote.USD;
    const now = new Date().toISOString();

    const normalized: TokenMarketData = {
      id: String(item.id),
      symbol: item.symbol,
      name: item.name,
      priceUsd: usd.price,
      change24h: usd.percent_change_24h ?? 0,
      volume24h: usd.volume_24h ?? 0,
      marketCap: usd.market_cap ?? 0,
      lastUpdated: usd.last_updated || now,
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
    // Basic fallback for CMC
    const mockPoint: PricePoint[] = [
      { timestamp: Date.now() - 86400000, price: 0 },
      { timestamp: Date.now(), price: 0 },
    ];
    return {
      data: mockPoint,
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
