/**
 * TradingView symbol resolution utilities.
 *
 * TradingView's embedded widgets expect exchange-qualified tickers such as
 * `BINANCE:BTCUSDT`, `COINBASE:ETHUSD`, `KRAKEN:SOLUSD`, etc. CoinGecko and
 * CoinMarketCap only give us a base asset symbol (BTC, ETH, ...). This module
 * bridges the two, and also defines the "advanced chart" widget configuration
 * used by the market terminal.
 */

export type TradingViewSymbol = {
  /** Exchange-qualified symbol, e.g. `BINANCE:BTCUSDT`. */
  symbol: string;
  /** Plain base symbol, e.g. `BTC`. */
  base: string;
  /** Exchange id used in the widget, e.g. `BINANCE`. */
  exchange: string;
  /** Quote currency, e.g. `USDT` or `USD`. */
  quote: string;
};

/**
 * Preferred exchange per base symbol. USDT-quoted pairs give the deepest
 * liquidity on TradingView's free widget tier; we fall back to BINANCE for
 * anything not explicitly mapped.
 */
const EXCHANGE_PREFERENCE: Record<string, string> = {
  BTC: "BINANCE",
  ETH: "BINANCE",
  SOL: "BINANCE",
  BNB: "BINANCE",
  XRP: "BINANCE",
  ADA: "BINANCE",
  DOGE: "BINANCE",
  AVAX: "BINANCE",
  DOT: "BINANCE",
  LINK: "BINANCE",
  MATIC: "BINANCE",
  POL: "BINANCE",
  LTC: "BINANCE",
  TRX: "BINANCE",
  SHIB: "BINANCE",
  UNI: "BINANCE",
  ATOM: "BINANCE",
  XLM: "BINANCE",
  ETC: "BINANCE",
  FIL: "BINANCE",
  APT: "BINANCE",
  ARB: "BINANCE",
  OP: "BINANCE",
  NEAR: "BINANCE",
  INJ: "BINANCE",
  SUI: "BINANCE",
  TIA: "BINANCE",
  SEI: "BINANCE",
  RUNE: "BINANCE",
  AAVE: "BINANCE",
  MKR: "BINANCE",
  ALGO: "BINANCE",
  FTM: "BINANCE",
  SAND: "BINANCE",
  MANA: "BINANCE",
  GRT: "BINANCE",
  IMX: "BINANCE",
  LDO: "BINANCE",
  PEPE: "BINANCE",
  WIF: "BINANCE",
  BONK: "BINANCE",
  FET: "BINANCE",
  RNDR: "BINANCE",
  JUP: "BINANCE",
  PYTH: "BINANCE",
  STX: "BINANCE",
  ORDI: "BINANCE",
  // Stablecoins are usually quoted against USD on Kraken/Coinbase.
  USDT: "KRAKEN",
  USDC: "KRAKEN",
  DAI: "COINBASE",
};

/** Symbols whose TradingView ticker differs from their common symbol. */
const SYMBOL_ALIASES: Record<string, string> = {
  POL: "POLUSDT",
  MATIC: "MATICUSDT",
  RNDR: "RENDERUSDT",
  // Common CoinGecko symbol -> TradingView ticker mismatches.
  MIOTA: "IOTAUSDT",
  AVAX: "AVAXUSDT",
  BCH: "BCHUSDT",
  BSV: "BSVUSDT",
  XBT: "BTCUSDT",
  WBT: "WBTCUSDT",
  STETH: "STETHUSDT",
  WSTETH: "WSTETHUSDT",
  RETH: "RETHUSDT",
  CBBTC: "CBBTCUSDT",
  TON114: "TONUSDT",
  TONCOIN: "TONUSDT",
  APTOS: "APTUSDT",
  ARBITRUM: "ARBUSDT",
  OPTIMISM: "OPUSDT",
  POLYGON: "POLUSDT",
  FANTOM: "FTMUSDT",
};

/**
 * Stablecoins / wrapped assets that TradingView only lists as USD pairs.
 * These are matched against the resolved base symbol.
 */
const USD_ONLY_BASES = new Set([
  "USDT",
  "USDC",
  "DAI",
  "TUSD",
  "FDUSD",
  "USDD",
  "PYUSD",
  "USDP",
  "GUSD",
]);

/**
 * Normalize an arbitrary user/agent supplied token string into a TradingView
 * exchange-qualified symbol.
 *
 * Accepts:
 *  - "BTC"                -> BINANCE:BTCUSDT
 *  - "btc"                -> BINANCE:BTCUSDT
 *  - "BINANCE:ETHUSDT"    -> BINANCE:ETHUSDT (passthrough)
 *  - "ETH/USDT"           -> BINANCE:ETHUSDT
 *  - "ETHUSD"             -> BINANCE:ETHUSDT
 */
export function resolveTradingViewSymbol(raw: string): TradingViewSymbol {
  const input = (raw || "").trim().toUpperCase();
  if (!input) {
    return { symbol: "BINANCE:BTCUSDT", base: "BTC", exchange: "BINANCE", quote: "USDT" };
  }

  // Already exchange-qualified: "EXCHANGE:PAIR"
  if (input.includes(":")) {
    const [exchange, pair] = input.split(":", 2);
    const { base, quote } = splitPair(pair);
    return { symbol: `${exchange}:${base}${quote}`, base, exchange, quote };
  }

  // "ETH/USDT" or "ETH-USDT"
  if (/[\/-]/.test(input)) {
    const [base, quoteRaw] = input.split(/[\/-]/, 2);
    const quote = normalizeQuote(quoteRaw);
    const exchange = EXCHANGE_PREFERENCE[base] || "BINANCE";
    return { symbol: `${exchange}:${base}${quote}`, base, exchange, quote };
  }

  const base = input.replace(/USDT$|USDC$|USD$/, "") || input;
  const exchange = EXCHANGE_PREFERENCE[base] || "BINANCE";
  const quote = USD_ONLY_BASES.has(base) ? "USD" : "USDT";
  const ticker = SYMBOL_ALIASES[base] || `${base}${quote}`;
  return { symbol: `${exchange}:${ticker}`, base, exchange, quote };
}

function splitPair(pair: string): { base: string; quote: string } {
  const cleaned = pair.replace(/[^A-Z0-9]/g, "");
  for (const q of ["USDT", "USDC", "USD", "BTC", "ETH", "EUR"]) {
    if (cleaned.endsWith(q) && cleaned.length > q.length) {
      return { base: cleaned.slice(0, -q.length), quote: q };
    }
  }
  return { base: cleaned, quote: "USDT" };
}

function normalizeQuote(quote: string): string {
  const q = quote.replace(/[^A-Z0-9]/g, "");
  if (q === "USD" || q === "USDT" || q === "USDC") return "USDT";
  return q || "USDT";
}

/** Interval mapping between our UI timeframes and TradingView intervals. */
export type ChartInterval = "1" | "5" | "15" | "60" | "240" | "D" | "W";

export const TIMEFRAME_TO_INTERVAL: Record<string, ChartInterval> = {
  "1h": "60",
  "24h": "60",
  "7d": "240",
  "30d": "D",
  "90d": "D",
  "1y": "W",
};

export function timeframeToInterval(timeframe: string): ChartInterval {
  return TIMEFRAME_TO_INTERVAL[timeframe] ?? "D";
}

/** Human-friendly labels for the advanced chart interval selector. */
export const INTERVAL_OPTIONS: { id: ChartInterval; label: string }[] = [
  { id: "1", label: "1m" },
  { id: "5", label: "5m" },
  { id: "15", label: "15m" },
  { id: "60", label: "1H" },
  { id: "240", label: "4H" },
  { id: "D", label: "1D" },
  { id: "W", label: "1W" },
];

export type WidgetTheme = "dark" | "light";

export interface AdvancedChartOptions {
  symbol: string;
  interval: ChartInterval;
  theme?: WidgetTheme;
  height?: number;
  /** Show the drawing toolbar (defaults to true). */
  allowSymbolChange?: boolean;
  studies?: string[];
  hideTopToolbar?: boolean;
  hideSideToolbar?: boolean;
}

/**
 * Serialize options for TradingView's Advanced Chart embed. The widget reads
 * this object from the iframe query string, so keep it URL-safe.
 */
export function buildAdvancedChartParams(options: AdvancedChartOptions): string {
  const {
    symbol,
    interval,
    theme = "dark",
    allowSymbolChange = false,
    studies = ["RSI@tv-basicstudies", "MASimple@tv-basicstudies"],
    hideTopToolbar = false,
    hideSideToolbar = false,
  } = options;

  const params: Record<string, string> = {
    symbol,
    interval,
    theme,
    style: "1",
    locale: "en",
    toolbar_bg: "#0b1220",
    enable_publishing: "false",
    allow_symbol_change: allowSymbolChange ? "true" : "false",
    hide_side_toolbar: hideSideToolbar ? "true" : "false",
    hide_top_toolbar: hideTopToolbar ? "true" : "false",
    withdateranges: "true",
    save_image: "true",
    details: "true",
    studies: studies.join(","),
    // Keep the chart visually consistent with the Babata obsidian HUD.
    backgroundColor: "rgba(3, 7, 18, 1)",
    gridColor: "rgba(103, 232, 249, 0.06)",
  };

  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export const TRADINGVIEW_ADVANCED_CHART_BASE =
  "https://s.tradingview.com/widgetembed/?";

/** Mini symbol overview widget (used on cards / compact panels). */
export function buildMiniSymbolOverviewParams(symbol: string): string {
  const params: Record<string, string> = {
    symbol,
    width: "100%",
    height: "100%",
    locale: "en",
    dateRange: "1D",
    colorTheme: "dark",
    isTransparent: "true",
    autosize: "true",
    trendLineColor: "#00F0FF",
    underLineColor: "rgba(0, 240, 255, 0.15)",
    underLineBottomColor: "rgba(0, 240, 255, 0)",
    lineColor: "#00F0FF",
    topColor: "rgba(0, 240, 255, 0.25)",
    bottomColor: "rgba(0, 240, 255, 0)",
  };
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export const TRADINGVIEW_MINI_CHART_BASE =
  "https://s.tradingview.com/embed-widget/mini-symbol-overview/?";
