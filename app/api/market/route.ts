import { NextRequest, NextResponse } from "next/server";
import { initializeProviderRegistry } from "@/lib/providers";
import { MarketDataProvider } from "@/lib/providers/interfaces";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";

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
  const symbol = searchParams.get("symbol") || "BTC";
  const timeframe = searchParams.get("timeframe") || "7d";

  const registry = initializeProviderRegistry();
  const provider = await registry.resolveProvider<MarketDataProvider>("market");

  if (!provider) {
    return NextResponse.json(
      { error: "No active market data provider available" },
      { status: 503 }
    );
  }

  try {
    const [marketResult, historyResult] = await Promise.all([
      provider.getTokenMarketData(symbol),
      provider.getTokenPriceHistory(symbol, timeframe),
    ]);

    return NextResponse.json({
      token: marketResult.data,
      history: historyResult.data,
      source: {
        provider: provider.id,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch market data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}