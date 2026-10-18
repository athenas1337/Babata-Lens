import { NextRequest, NextResponse } from "next/server";
import { initializeProviderRegistry } from "@/lib/providers";
import { MarketDataProvider, CoinSummary } from "@/lib/providers/interfaces";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/movers?limit=10
 *
 * Returns the top gainers and losers from the top-250 coin universe, plus a
 * global sentiment snapshot. Backed by CoinGecko via the provider registry.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorizedResponse();

  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit("ip", ip, { windowMs: 60 * 1000, max: 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(Number.parseInt(searchParams.get("limit") || "10", 10) || 10, 25));

  const registry = initializeProviderRegistry();
  const provider = registry
    .getProvidersByCapability<MarketDataProvider>("market")
    .find((p) => typeof p.getCoinList === "function");

  if (!provider?.getCoinList) {
    return NextResponse.json(
      { error: "No market provider supports coin enumeration" },
      { status: 503 }
    );
  }

  try {
    const { data: coins } = await provider.getCoinList({ page: 1, perPage: 250 });

    const withChange = coins.filter(
      (c): c is CoinSummary & { change24h: number } =>
        typeof c.change24h === "number" && Number.isFinite(c.change24h)
    );

    const sorted = [...withChange].sort((a, b) => b.change24h - a.change24h);
    const gainers = sorted.slice(0, limit);
    const losers = sorted.slice(-limit).reverse();

    const advancing = withChange.filter((c) => c.change24h > 0).length;
    const declining = withChange.filter((c) => c.change24h < 0).length;

    return NextResponse.json(
      {
        gainers,
        losers,
        sentiment: {
          advancing,
          declining,
          total: withChange.length,
          /** 0-100; >50 means bullish breadth. */
          score:
            withChange.length > 0
              ? Math.round((advancing / withChange.length) * 100)
              : 50,
        },
        source: { provider: provider.id, fetchedAt: new Date().toISOString() },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute movers" },
      { status: 500 }
    );
  }
}
