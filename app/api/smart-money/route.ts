import { NextRequest, NextResponse } from "next/server";
import { initializeProviderRegistry } from "@/lib/providers";
import { SmartMoneyProvider } from "@/lib/providers/interfaces";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

const ALLOWED_CHAINS = new Set([
  "ethereum",
  "solana",
  "base",
  "arbitrum",
  "polygon",
  "bnb",
  "avalanche",
]);

/**
 * GET /api/smart-money?view=holdings|netflows&chain=solana&limit=10
 *
 * Smart-money intelligence backed by labelled-wallet providers (Nansen).
 *
 * `configured:false` with HTTP 200 is deliberate: "no provider key" is a
 * product state the UI renders as an unlock prompt, not a server error. Real
 * upstream failures still return 502.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorizedResponse();

  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit("ip", ip, { windowMs: 60 * 1000, max: 30 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") === "netflows" ? "netflows" : "holdings";
  const chainParam = (searchParams.get("chain") || "").toLowerCase();
  const limit = Math.max(1, Math.min(Number.parseInt(searchParams.get("limit") || "10", 10) || 10, 50));

  if (chainParam && !ALLOWED_CHAINS.has(chainParam)) {
    return NextResponse.json({ error: `Unsupported chain: ${chainParam}` }, { status: 400 });
  }

  const registry = initializeProviderRegistry();
  const provider = registry.getProvidersByCapability<SmartMoneyProvider>("smart-money")[0];

  if (!provider) {
    return NextResponse.json({
      configured: false,
      view,
      data: [],
      provider: "none",
      unlock: {
        envVar: "NANSEN_API_KEY",
        label: "Nansen Smart Money",
        note: "Nansen has no free API tier; its Smart Money endpoints require a paid plan.",
      },
      message:
        "Smart-money tracking needs a labelled-wallet data provider. Set NANSEN_API_KEY " +
        "(paid Nansen API plan) to enable it, or MORALIS_API_KEY (free) for on-chain " +
        "holder concentration. No figures are shown until then — this app never substitutes " +
        "simulated wallet data.",
    });
  }

  const query = { chains: chainParam ? [chainParam] : undefined, limit };

  try {
    const result =
      view === "netflows"
        ? await provider.getSmartMoneyNetflows(query)
        : await provider.getSmartMoneyHoldings(query);

    // `proxy` distinguishes measured on-chain concentration from Nansen's
    // labelled cohorts. The UI must never present one as the other.
    const isProxy = (provider as { isProxy?: boolean }).isProxy === true;

    return NextResponse.json(
      {
        configured: true,
        view,
        data: result.data,
        count: result.data.length,
        provider: result.source.provider,
        proxy: isProxy,
        unlock: isProxy
          ? {
              envVar: "NANSEN_API_KEY",
              label: "Nansen Smart Money",
              note: "Labelled cohorts and net flows; currently showing an on-chain proxy.",
            }
          : undefined,
        chains: provider.supportedChains,
        source: { provider: result.source.provider, fetchedAt: result.source.fetchedAt },
      },
      {
        headers: {
          // Authenticated payload: browser cache only, never a shared CDN.
          "Cache-Control": "private, max-age=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Smart-money query failed";
    logger.warn("Smart-money request failed", {
      provider: provider.id,
      data: { view, chain: chainParam, error: message },
    });

    // "Provider reachable but key missing" is a product state (show the unlock
    // prompt), not a server error. Genuine upstream failures stay 502.
    const needsKey = /MORALIS_API_KEY|NANSEN_API_KEY/.test(message);
    if (needsKey) {
      return NextResponse.json({
        configured: false,
        view,
        data: [],
        provider: provider.id,
        unlock: {
          envVar: "MORALIS_API_KEY",
          label: "Moralis (free tier)",
          note: "Free holder data; NANSEN_API_KEY adds labelled cohorts and net flows.",
        },
        message,
      });
    }

    return NextResponse.json({ error: message, provider: provider.id }, { status: 502 });
  }
}
