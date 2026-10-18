import { NextRequest, NextResponse } from "next/server";
import { initializeProviderRegistry } from "@/lib/providers";
import { MarketDataProvider } from "@/lib/providers/interfaces";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";
import { resolveTradingViewSymbol, timeframeToInterval } from "@/lib/tradingview/symbols";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Authentication check
  const auth = await authenticateRequest(req);
  if (!auth) {
    return unauthorizedResponse();
  }

  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit("ip", ip, { windowMs: 60 * 1000, max: 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTC").trim();
  const timeframe = searchParams.get("timeframe") || "7d";
  const includeHistory = searchParams.get("history") !== "false";

  if (symbol.length > 40) {
    return NextResponse.json({ error: "Symbol is too long" }, { status: 400 });
  }

  const registry = initializeProviderRegistry();
  const provider = await registry.resolveProvider<MarketDataProvider>("market");

  if (!provider) {
    return NextResponse.json(
      { error: "No active market data provider available" },
      { status: 503 }
    );
  }

  const tv = resolveTradingViewSymbol(symbol);

  try {
    const marketResult = await provider.getTokenMarketData(symbol);

    let history: Awaited<ReturnType<typeof provider.getTokenPriceHistory>>["data"] = [];
    if (includeHistory) {
      try {
        const historyResult = await provider.getTokenPriceHistory(symbol, timeframe);
        history = historyResult.data;
      } catch (historyErr) {
        // History is best-effort; still return the spot price on failure.
        logger.warn("Market history fetch failed", {
          provider: provider.id,
          data: { symbol, timeframe, error: String(historyErr) },
        });
      }
    }

    return NextResponse.json(
      {
        token: marketResult.data,
        history,
        tradingView: {
          symbol: tv.symbol,
          base: tv.base,
          exchange: tv.exchange,
          quote: tv.quote,
          interval: timeframeToInterval(timeframe),
        },
        source: {
          provider: provider.id,
          fetchedAt: new Date().toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (err: unknown) {
    logger.error("Market data request failed", {
      provider: provider.id,
      data: { symbol, timeframe, error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json(
      { error: "Failed to fetch market data. Please retry shortly." },
      { status: 502 }
    );
  }
}