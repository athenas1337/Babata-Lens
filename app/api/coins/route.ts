import { NextRequest, NextResponse } from "next/server";
import { initializeProviderRegistry } from "@/lib/providers";
import { MarketDataProvider, CoinListQuery } from "@/lib/providers/interfaces";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/coins
 *
 * Enumerates the coin universe (1000+ on CoinGecko) for the market scanner and
 * TradingView symbol selector.
 *
 * Query params:
 *   ?page=1        Page number (default 1)
 *   ?perPage=250   Items per page (default 250, max 250)
 *   ?search=eth    Free-text filter across symbol/name
 *   ?currency=usd  Quote currency (default usd)
 *   ?order=market_cap_desc  Sort order
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return unauthorizedResponse();
  }

  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit("ip", ip, { windowMs: 60 * 1000, max: 120 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { searchParams } = new URL(req.url);

  const query: CoinListQuery = {
    page: clampInt(searchParams.get("page"), 1, 1, 20),
    perPage: clampInt(searchParams.get("perPage"), 250, 1, 250),
    search: searchParams.get("search") || undefined,
    currency: searchParams.get("currency") || "usd",
    order: searchParams.get("order") || "market_cap_desc",
  };

  const registry = initializeProviderRegistry();

  // Prefer a provider that actually implements getCoinList (CoinGecko).
  const candidates = registry.getProvidersByCapability<MarketDataProvider>("market");
  const provider = candidates.find((p) => typeof p.getCoinList === "function");

  if (!provider || !provider.getCoinList) {
    return NextResponse.json(
      { error: "No active market data provider supports coin enumeration" },
      { status: 503 }
    );
  }

  try {
    const result = await provider.getCoinList(query);

    return NextResponse.json(
      {
        coins: result.data,
        count: result.data.length,
        page: query.page,
        perPage: query.perPage,
        source: {
          provider: result.source.provider,
          fetchedAt: result.source.fetchedAt,
        },
      },
      {
        headers: {
          // Allow the CDN / browser to serve repeat scans instantly.
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch coin list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
