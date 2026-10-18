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
  CoinSummary,
  CoinListQuery,
} from "../interfaces";
import { logger } from "../../observability/logger";
import { getCache } from "../../cache";
import { resolveTradingViewSymbol } from "../../tradingview/symbols";

const CoinGeckoSimplePriceSchema = z.record(
  z.object({
    usd: z.number(),
    usd_24h_change: z.number().optional().default(0),
    usd_24h_vol: z.number().optional().default(0),
    usd_market_cap: z.number().optional().default(0),
    last_updated_at: z.number().optional(),
  })
);

const CoinGeckoMarketCoinSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  image: z.string().optional(),
  current_price: z.number().nullable().optional(),
  market_cap: z.number().nullable().optional(),
  market_cap_rank: z.number().nullable().optional(),
  total_volume: z.number().nullable().optional(),
  price_change_percentage_24h: z.number().nullable().optional(),
});

type CoinGeckoMarketCoin = z.infer<typeof CoinGeckoMarketCoinSchema>;

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

  /**
   * Resolve a base symbol (BTC) or a raw CoinGecko id (bitcoin) to a canonical
   * CoinGecko id. Uses a small static map for the top assets (zero extra calls),
   * then falls back to a cached dynamic lookup across the full 1000+ coin list.
   */
  private mapSymbolToId(symbol: string): string {
    const s = symbol.toLowerCase();
    const map: Record<string, string> = {
      btc: "bitcoin",
      eth: "ethereum",
      sol: "solana",
      usdt: "tether",
      usdc: "usd-coin",
      bnb: "binancecoin",
      xrp: "ripple",
      ada: "cardano",
      doge: "dogecoin",
      matic: "matic-network",
      pol: "polygon-ecosystem-token",
      avax: "avalanche-2",
      dot: "polkadot",
      link: "chainlink",
      trx: "tron",
      shib: "shiba-inu",
      ltc: "litecoin",
      uni: "uniswap",
      atom: "cosmos",
      xlm: "stellar",
      etc: "ethereum-classic",
      fil: "filecoin",
      apt: "aptos",
      arb: "arbitrum",
      op: "optimism",
      near: "near",
      inj: "injective-protocol",
      sui: "sui",
      tia: "celestia",
      sei: "sei-network",
      rune: "thorchain",
      aave: "aave",
      mkr: "maker",
      algo: "algorand",
      ftm: "fantom",
      sand: "the-sandbox",
      mana: "decentraland",
      grt: "the-graph",
      imx: "immutable-x",
      ldo: "lido-dao",
      pepe: "pepe",
      wif: "dogwifcoin",
      bonk: "bonk",
      fet: "fetch-ai",
      rndr: "render-token",
      jup: "jupiter-exchange-solana",
      pyth: "pyth-network",
      stx: "blockstack",
      ordi: "ordinals",
    };
    if (map[s]) return map[s];

    // If the caller already passed a CoinGecko id (contains a dash or matches
    // a known multi-word id) we accept it verbatim.
    if (s.includes("-") || s.length > 12) return s;

    return s;
  }

  /**
   * Dynamic symbol -> id resolution backed by a cached coin-list scan. Only used
   * as a fallback when the static map misses, so common queries stay instant.
   */
  private async resolveCoinId(symbol: string): Promise<string> {
    const upper = symbol.toUpperCase();
    const staticId = this.mapSymbolToId(upper);

    // Fast path: static map produced a real id (differs from the raw symbol).
    if (staticId !== symbol.toLowerCase() && staticId !== upper.toLowerCase()) {
      return staticId;
    }

    // A CoinGecko id looks like "bitcoin", "avalanche-2", "render-token".
    if (symbol.includes("-") || symbol.length > 12) {
      return symbol.toLowerCase();
    }

    // Slow path: scan the cached top-250 index for the symbol.
    try {
      const cache = getCache();
      const indexKey = cache.generateKey(this.id, "symbol_index", { page: 1, perPage: 250 });
      let index = await cache.get<Record<string, string>>(indexKey);

      if (!index) {
        const { data } = await this.getCoinList({ page: 1, perPage: 250 });
        index = {};
        for (const coin of data) {
          const key = coin.symbol.toUpperCase();
          if (!index[key]) index[key] = coin.id;
        }
        await cache.set(indexKey, index, 300);
      }

      return index[upper] || staticId;
    } catch (err) {
      logger.warn("Dynamic CoinGecko symbol resolution failed, using static map", {
        provider: this.id,
        data: { symbol, error: String(err) },
      });
      return staticId;
    }
  }

  async getTokenMarketData(query: string | TokenQuery): Promise<ProviderResult<TokenMarketData>> {
    // Normalize: accept both string and TokenQuery
    const rawSymbol = typeof query === "string" ? query : (query.symbol || "btc");
    const symbol = rawSymbol.toUpperCase();
    const coinId = await this.resolveCoinId(symbol);
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
    const coinId = await this.resolveCoinId(symbol);
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

  /**
   * Enumerate coins from CoinGecko's `/coins/markets` endpoint. This returns
   * 250 coins per page; with `perPage: 250` and multiple pages we expose the
   * full 1000+ top-coin universe used by the market scanner and TradingView
   * selector.
   *
   * Free-tier CoinGecko caps `per_page` at 250 and rate-limits aggressively,
   * so results are cached for 120s and we clamp perPage accordingly.
   */
  async getCoinList(query: CoinListQuery = {}): Promise<ProviderResult<CoinSummary[]>> {
    const page = Math.max(1, Math.min(query.page ?? 1, 20));
    const perPage = Math.max(1, Math.min(query.perPage ?? 250, 250));
    const currency = (query.currency || "usd").toLowerCase();
    const order = query.order || "market_cap_desc";
    const search = (query.search || "").trim().toLowerCase();

    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "coin_list", {
      page,
      perPage,
      currency,
      order,
    });

    let coins: CoinGeckoMarketCoin[] | null = await cache.get<CoinGeckoMarketCoin[]>(cacheKey);

    if (!coins) {
      const url =
        `${this.baseUrl}/coins/markets?vs_currency=${currency}` +
        `&order=${order}&per_page=${perPage}&page=${page}` +
        `&sparkline=false&price_change_percentage=24h`;

      const res = await fetch(url, {
        headers: this.apiKey ? { "x-cg-demo-api-key": this.apiKey } : {},
        // Coins list is heavy; allow Next.js edge caching downstream.
        cache: "no-store",
      });

      if (!res.ok) {
        logger.error("CoinGecko coin list fetch failed", {
          provider: this.id,
          statusCode: res.status,
        });
        throw new Error(`CoinGecko coin list failed with status ${res.status}`);
      }

      const raw = await res.json();
      const parsed = z.array(CoinGeckoMarketCoinSchema).safeParse(raw);
      if (!parsed.success) {
        logger.warn("CoinGecko coin list malformed", {
          provider: this.id,
          data: { sample: Array.isArray(raw) ? raw.slice(0, 2) : raw },
        });
        throw new Error("CoinGecko returned an invalid coin list payload");
      }

      coins = parsed.data;
      await cache.set(cacheKey, coins, 120);
    }

    const normalized: CoinSummary[] = coins.map((c) => {
      const symbol = c.symbol.toUpperCase();
      const tv = resolveTradingViewSymbol(symbol);
      return {
        id: c.id,
        symbol,
        name: c.name,
        priceUsd: c.current_price ?? undefined,
        change24h: c.price_change_percentage_24h ?? undefined,
        marketCap: c.market_cap ?? undefined,
        volume24h: c.total_volume ?? undefined,
        marketCapRank: c.market_cap_rank ?? undefined,
        image: c.image,
        tradingViewSymbol: tv.symbol,
      };
    });

    const filtered = search
      ? normalized.filter(
          (c) =>
            c.symbol.toLowerCase().includes(search) ||
            c.name.toLowerCase().includes(search)
        )
      : normalized;

    return {
      data: filtered,
      source: {
        provider: this.id,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
