import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
}

export const GetTokenMarketDataSchema = z
  .object({
    symbolOrAddress: z.string().optional(),
    symbol: z.string().optional(),
  })
  .transform((val) => ({
    symbolOrAddress: val.symbolOrAddress || val.symbol || "BTC",
  }));

export const GetTokenPriceHistorySchema = z.object({
  symbol: z.string().describe("Token symbol (e.g. BTC, ETH, SOL)"),
  timeframe: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
});

export const GetWalletBalanceSchema = z.object({
  address: z.string().describe("Blockchain address (EVM 0x... or Solana base58)"),
  network: z.string().default("ethereum").describe("Network (e.g. ethereum, polygon, arbitrum, solana)"),
});

export const GetWalletTransactionsSchema = z.object({
  address: z.string().describe("Blockchain address"),
  network: z.string().default("ethereum"),
  limit: z.number().min(1).max(50).default(10),
});

export const GetTransactionDetailsSchema = z
  .object({
    txHash: z.string().optional(),
    hash: z.string().optional(),
    network: z.string().default("ethereum"),
  })
  .transform((val) => ({
    txHash: val.txHash || val.hash || "",
    network: val.network,
  }));

export const GetContractAbiInfoSchema = z
  .object({
    address: z.string().optional(),
    contractAddress: z.string().optional(),
    network: z.string().default("ethereum"),
  })
  .transform((val) => ({
    address: val.address || val.contractAddress || "",
    network: val.network,
  }));

export const GetTokenHolderDistributionSchema = z
  .object({
    address: z.string().optional(),
    contractAddress: z.string().optional(),
    network: z.string().default("ethereum"),
  })
  .transform((val) => ({
    address: val.address || val.contractAddress || "",
    network: val.network,
  }));

export const RunDuneAnalyticsSchema = z.object({
  queryId: z.union([
    z.number(),
    z.string().transform((v) => {
      const parsed = parseInt(v, 10);
      if (isNaN(parsed)) throw new Error(`Invalid queryId: ${v}`);
      return parsed;
    }),
  ]),
});

export const GetExchangeTickerSchema = z.object({
  symbol: z.string().describe("Trading pair symbol (e.g. BTC-USDT)"),
  exchange: z.string().default("bingx"),
});

export const BABATA_TOOLS: ToolDefinition[] = [
  {
    name: "get_token_market_data",
    description: "Get real-time token market data: price, 24h change, volume, market cap, high, low, ATH, ATL, circulating supply, and FDV.",
    parameters: GetTokenMarketDataSchema,
  },
  {
    name: "get_token_price_history",
    description: "Get historical price chart data points for a token across timeframes (24h, 7d, 30d, 90d, 1y).",
    parameters: GetTokenPriceHistorySchema,
  },
  {
    name: "get_wallet_balance",
    description: "Query native and token balances for an address on EVM chains or Solana.",
    parameters: GetWalletBalanceSchema,
  },
  {
    name: "get_wallet_transactions",
    description: "Fetch recent transaction history for a wallet address on EVM chains or Solana.",
    parameters: GetWalletTransactionsSchema,
  },
  {
    name: "get_transaction_details",
    description: "Retrieve comprehensive details for a transaction hash, including status, fee, gas, block, and values.",
    parameters: GetTransactionDetailsSchema,
  },
  {
    name: "get_contract_abi_info",
    description: "Check if a smart contract is verified on-chain, retrieving its name, compiler, and functions list.",
    parameters: GetContractAbiInfoSchema,
  },
  {
    name: "get_token_holder_distribution",
    description: "Fetch top token holders and concentration metrics to detect whale dominance or centralization risks.",
    parameters: GetTokenHolderDistributionSchema,
  },
  {
    name: "run_dune_analytics",
    description: "Execute a Dune Analytics query to get tabular on-chain analytics and dashboard metrics.",
    parameters: RunDuneAnalyticsSchema,
  },
  {
    name: "get_exchange_ticker",
    description: "Get real-time exchange ticker data (last price, 24h high/low, volume) from BingX.",
    parameters: GetExchangeTickerSchema,
  },
];
