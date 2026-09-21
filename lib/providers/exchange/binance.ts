import { z } from "zod";
import {
  ExchangeDataProvider,
  ProviderResult,
  TickerData,
  ProviderCapability,
  TickerDataSchema,
} from "../interfaces";
import { getCache } from "../../cache";
import { logger } from "../../observability/logger";

const BinanceTickerSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  highPrice: z.string().optional(),
  lowPrice: z.string().optional(),
  volume: z.string(),
  openPrice: z.string().optional(),
  priceChangePercent: z.string().optional(),
});

export class BinanceProvider implements ExchangeDataProvider {
  id = "binance";
  name = "Binance (Global Vision)";
  capability: ProviderCapability = "exchange";
  requiredEnvVars: string[] = []; // Zero API key required

  private baseUrl = "https://data-api.binance.vision/api/v3";
  private fallbackUrl = "https://api.gateio.ws/api/v4/spot/tickers";

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/ping`);
      return res.status === 200;
    } catch {
      return false;
    }
  }

  private normalizeSymbol(raw: string): string {
    const clean = raw.trim().toUpperCase().replace(/[-_/]/g, "");
    if (clean.endsWith("USDT") || clean.endsWith("BUSD") || clean.endsWith("USDC") || clean.endsWith("BTC")) {
      return clean;
    }
    return `${clean}USDT`;
  }

  async getExchangeTicker(symbol: string): Promise<ProviderResult<TickerData>> {
    const formatted = this.normalizeSymbol(symbol);
    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "ticker", { symbol: formatted });
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

    // 1. Attempt Binance Vision Public API
    try {
      const res = await fetch(`${this.baseUrl}/ticker/24hr?symbol=${formatted}`);
      if (res.ok) {
        const raw = await res.json();
        const parsed = BinanceTickerSchema.safeParse(raw);
        if (parsed.success) {
          const item = parsed.data;
          const now = new Date().toISOString();
          const ticker: TickerData = {
            symbol: item.symbol,
            lastPrice: parseFloat(item.lastPrice) || 0,
            highPrice: item.highPrice ? parseFloat(item.highPrice) : undefined,
            lowPrice: item.lowPrice ? parseFloat(item.lowPrice) : undefined,
            volume: parseFloat(item.volume) || 0,
            openPrice: item.openPrice ? parseFloat(item.openPrice) : undefined,
            change24h: item.priceChangePercent ? parseFloat(item.priceChangePercent) : 0,
            timestamp: now,
          };

          TickerDataSchema.parse(ticker);
          await cache.set(cacheKey, ticker, 15);

          return {
            data: ticker,
            source: {
              provider: this.id,
              fetchedAt: now,
            },
          };
        }
      }
    } catch (binanceErr) {
      logger.warn("Binance Vision ticker failed, trying Gate.io fallback", {
        provider: this.id,
        data: { error: String(binanceErr) },
      });
    }

    // 2. Fallback to Gate.io Public API
    try {
      const gateSymbol = symbol.includes("-") ? symbol.replace("-", "_").toUpperCase() : `${symbol.toUpperCase()}_USDT`;
      const res = await fetch(`${this.fallbackUrl}?currency_pair=${gateSymbol}`);
      if (res.ok) {
        const arr = (await res.json()) as {
          currency_pair?: string;
          last?: string;
          high_24h?: string;
          low_24h?: string;
          base_volume?: string;
          change_percentage?: string;
        }[];
        const item = arr[0];
        if (item && item.last) {
          const now = new Date().toISOString();
          const ticker: TickerData = {
            symbol: formatted,
            lastPrice: parseFloat(item.last) || 0,
            highPrice: item.high_24h ? parseFloat(item.high_24h) : undefined,
            lowPrice: item.low_24h ? parseFloat(item.low_24h) : undefined,
            volume: item.base_volume ? parseFloat(item.base_volume) : 0,
            change24h: item.change_percentage ? parseFloat(item.change_percentage) : 0,
            timestamp: now,
          };

          TickerDataSchema.parse(ticker);
          await cache.set(cacheKey, ticker, 15);

          return {
            data: ticker,
            source: {
              provider: "gateio-fallback",
              fetchedAt: now,
            },
          };
        }
      }
    } catch (fallbackErr) {
      logger.warn("Gate.io fallback ticker also failed", {
        provider: this.id,
        data: { error: String(fallbackErr) },
      });
    }

    throw new Error(`Unable to fetch ticker data for symbol ${symbol} from exchange feeds.`);
  }
}
