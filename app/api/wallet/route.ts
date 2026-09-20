import { NextRequest, NextResponse } from "next/server";
import { initializeProviderRegistry } from "@/lib/providers";
import { BlockchainDataProvider } from "@/lib/providers/interfaces";
import { validateAddress } from "@/lib/security/sanitization";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";

export async function GET(req: NextRequest) {
  // Authentication check
  const auth = await authenticateRequest(req);
  if (!auth) {
    return unauthorizedResponse();
  }

  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit("ip", ip, { windowMs: 60 * 1000, max: 45 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const network = (searchParams.get("network") || "ethereum").toLowerCase();

  if (!address) {
    return NextResponse.json({ error: "Missing required 'address' query parameter" }, { status: 400 });
  }

  // Pass actual network name — validateAddress checks for "solana" internally
  const validation = validateAddress(address, network);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const registry = initializeProviderRegistry();
  const provider = await registry.resolveProvider<BlockchainDataProvider>("blockchain");

  if (!provider) {
    return NextResponse.json(
      { error: "No active blockchain data provider available" },
      { status: 503 }
    );
  }

  try {
    const [balanceResult, txsResult] = await Promise.all([
      provider.getWalletBalance(validation.normalized, network),
      provider.getWalletTransactions(validation.normalized, network, { page: 1, limit: 10 }),
    ]);

    return NextResponse.json({
      balance: balanceResult.data,
      transactions: txsResult.data,
      source: {
        provider: provider.id,
        network,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch wallet data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}