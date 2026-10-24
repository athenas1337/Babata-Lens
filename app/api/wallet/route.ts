import { NextRequest, NextResponse } from "next/server";
import { initializeProviderRegistry } from "@/lib/providers";
import { BlockchainDataProvider } from "@/lib/providers/interfaces";
import { validateAddress, EVM_ADDRESS_REGEX } from "@/lib/security/sanitization";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
  const requestedNetwork = (searchParams.get("network") || "").toLowerCase();

  if (!address) {
    return NextResponse.json({ error: "Missing required 'address' query parameter" }, { status: 400 });
  }

  // Infer the network from the address shape so a Solana address pasted with the
  // default "ethereum" selection is not rejected as an invalid EVM address.
  const network = inferNetwork(address, requestedNetwork);

  const validation = validateAddress(address, network);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const registry = initializeProviderRegistry();
  const provider = await registry.resolveProvider<BlockchainDataProvider>("blockchain", network);

  if (!provider) {
    return NextResponse.json(
      { error: "No active blockchain data provider available" },
      { status: 503 }
    );
  }

  // Balance and history are independent: a provider that cannot list transfers
  // (e.g. Alchemy for Solana) must not zero out the balance panel.
  const [balanceOutcome, txsOutcome] = await Promise.allSettled([
    provider.getWalletBalance(validation.normalized, network),
    provider.getWalletTransactions(validation.normalized, network, { page: 1, limit: 10 }),
  ]);

  if (balanceOutcome.status === "rejected") {
    const message =
      balanceOutcome.reason instanceof Error
        ? balanceOutcome.reason.message
        : "Failed to fetch wallet data";
    logger.warn("Wallet balance lookup failed", {
      provider: provider.id,
      data: { network, error: message },
    });
    return NextResponse.json({ error: message, provider: provider.id }, { status: 502 });
  }

  const transactions =
    txsOutcome.status === "fulfilled" ? txsOutcome.value.data : [];
  const transactionsError =
    txsOutcome.status === "rejected"
      ? txsOutcome.reason instanceof Error
        ? txsOutcome.reason.message
        : "Transaction history unavailable"
      : undefined;

  return NextResponse.json({
    balance: balanceOutcome.value.data,
    transactions,
    ...(transactionsError ? { transactionsError } : {}),
    source: {
      provider: provider.id,
      network,
      fetchedAt: new Date().toISOString(),
    },
  });
}

/**
 * Resolve the network: an explicit non-default selection wins, otherwise the
 * address shape decides (EVM 0x… vs Base58 Solana).
 */
function inferNetwork(address: string, requestedNetwork: string): string {
  const trimmed = address.trim();
  // An explicit non-default selection (polygon, arbitrum, ...) is authoritative.
  if (requestedNetwork && requestedNetwork !== "ethereum") return requestedNetwork;
  if (EVM_ADDRESS_REGEX.test(trimmed)) return "ethereum";
  // Base58 input left on the default network: treat it as Solana instead of
  // failing EVM validation.
  return "solana";
}
