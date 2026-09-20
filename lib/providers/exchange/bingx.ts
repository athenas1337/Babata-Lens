import { z } from "zod";
import {
  ExchangeDataProvider,
  ProviderResult,
  TickerData,
  ProviderCapability,
  TickerDataSchema,
} from "../interfaces";
import { getCache } from "../../cache";

const BingXTickerItemSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  highPrice: z.string().optional(),
  lowPrice: z.string().optional(),
  volume: z.string(),
  openPrice: z.string().optional(),
  priceChangePercent: z.string().optional(),
});

const BingXTickerSchema = z.object({
  code: z.number(),
  data: z.union([BingXTickerItemSchema, z.array(BingXTickerItemSchema)]),
});

export class BingXProvider implements ExchangeDataProvider {
  id = "bingx";
  name = "BingX Exchange";
  capability: ProviderCapability = "exchange";
  requiredEnvVars: string[] = []; // public ticker endpoint does not require secret

  private baseUrl = "https://open-api.bingx.com/openApi/swap/v2/quote/ticker";

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}?symbol=BTC-USDT`);
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getExchangeTicker(symbol: string): Promise<ProviderResult<TickerData>> {
    const formattedSymbol = symbol.includes("-") ? symbol.toUpperCase() : `${symbol.toUpperCase()}-USDT`;
    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "ticker", { symbol: formattedSymbol });
    const cached = await cache.get<TickerData>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: {
          provider: this.id,
          fetchedAt: cached.timestamp,
        },
      };
    }

    const res = await fetch(`${this.baseUrl}?symbol=${formattedSymbol}`);
    if (!res.ok) {
      throw new Error(`BingX ticker request failed with status ${res.status}`);
    }

    const raw = await res.json();
    const parsed = BingXTickerSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.data) {
      throw new Error(`BingX returned invalid data for symbol: ${formattedSymbol}`);
    }

    const item = Array.isArray(parsed.data.data) ? parsed.data.data[0] : parsed.data.data;
    if (!item) {
      throw new Error(`BingX returned invalid item for symbol: ${formattedSymbol}`);
    }
    const now = new Date().toISOString();

    const data: TickerData = {
      symbol: item.symbol,
      lastPrice: parseFloat(item.lastPrice) || 0,
      highPrice: item.highPrice ? parseFloat(item.highPrice) : undefined,
      lowPrice: item.lowPrice ? parseFloat(item.lowPrice) : undefined,
      volume: parseFloat(item.volume) || 0,
      openPrice: item.openPrice ? parseFloat(item.openPrice) : undefined,
      change24h: item.priceChangePercent ? parseFloat(item.priceChangePercent) : 0,
      timestamp: now,
    };

    TickerDataSchema.parse(data);
    await cache.set(cacheKey, data, 15);

    return {
      data,
      source: {
        provider: this.id,
        fetchedAt: now,
      },
    };
  }
}
