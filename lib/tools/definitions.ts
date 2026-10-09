import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
}

const NetworkField = z
  .enum(["ethereum", "polygon", "arbitrum", "optimism", "base", "solana", "bsc"])
  .default("ethereum")
  .describe("Blockchain network. Use 'solana' for Solana addresses.");

export const GetTokenMarketDataSchema = z.object({
  symbolOrAddress: z
    .string()
    .optional()
    .describe("Token symbol (e.g. BTC, ETH, SOL) or contract address."),
  symbol: z.string().optional().describe("Alias for symbolOrAddress."),
});

export const GetTokenPriceHistorySchema = z.object({
  symbol: z.string().describe("Token symbol (e.g. BTC, ETH, SOL)"),
  timeframe: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
});

export const GetWalletBalanceSchema = z.object({
  address: z.string().describe("Blockchain address (EVM 0x... or Solana base58)"),
  network: NetworkField,
});

export const GetWalletTransactionsSchema = z.object({
  address: z.string().describe("Blockchain address"),
  network: NetworkField,
  limit: z.number().min(1).max(50).default(10),
});

export const GetTransactionDetailsSchema = z.object({
  txHash: z.string().describe("Transaction hash / signature to inspect"),
  hash: z.string().optional().describe("Alias for txHash."),
  network: NetworkField,
});

export const GetContractAbiInfoSchema = z.object({
  address: z.string().describe("Smart contract address"),
  contractAddress: z.string().optional().describe("Alias for address."),
  network: NetworkField,
});

export const GetTokenHolderDistributionSchema = z.object({
  address: z.string().describe("Token contract address"),
  contractAddress: z.string().optional().describe("Alias for address."),
  network: NetworkField,
});

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
  symbol: z.string().describe("Trading pair symbol (e.g. BTC-USDT or BTCUSDT)"),
  exchange: z.string().default("binance"),
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
    description: "Get real-time exchange ticker data (last price, 24h high/low, volume) from Binance Global Vision with Gate.io fallback.",
    parameters: GetExchangeTickerSchema,
  },
];

/**
 * Convert a tool's Zod parameters into a JSON Schema object suitable for
 * Anthropic / OpenAI / Gemini native tool-calling APIs.
 */
export function toolParametersToJsonSchema(tool: ToolDefinition): Record<string, unknown> {
  const schema = zodToJsonSchema(tool.parameters, {
    target: "jsonSchema7",
    $refStrategy: "none",
  }) as Record<string, unknown>;

  // Strip unsupported top-level keywords for strict providers.
  delete schema.$schema;
  delete schema.additionalProperties;

  if (!schema.type) schema.type = "object";
  if (!schema.properties) schema.properties = {};
  return schema;
}

/**
 * Normalize aliased tool arguments emitted by LLMs into the canonical shape
 * expected by the executor's schemas.
 */
export function normalizeToolInput(
  toolName: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...input };

  const pickAlias = (canonical: string, ...aliases: string[]) => {
    if (normalized[canonical] !== undefined && normalized[canonical] !== "") return;
    for (const alias of aliases) {
      const value = normalized[alias];
      if (value !== undefined && value !== "") {
        normalized[canonical] = value;
        return;
      }
    }
  };

  switch (toolName) {
    case "get_token_market_data":
      pickAlias("symbolOrAddress", "symbol", "token", "query");
      break;
    case "get_transaction_details":
      pickAlias("txHash", "hash", "tx_hash", "transactionHash");
      break;
    case "get_contract_abi_info":
    case "get_token_holder_distribution":
      pickAlias("address", "contractAddress", "contract", "tokenAddress");
      break;
    default:
      break;
  }

  // Strip alias keys so the strict canonical schema does not reject unknown data.
  delete normalized.token;
  delete normalized.query;
  delete normalized.tx_hash;
  delete normalized.transactionHash;
  delete normalized.contract;
  delete normalized.tokenAddress;

  return normalized;
}
