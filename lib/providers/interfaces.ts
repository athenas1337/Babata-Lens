import { z } from "zod";

export interface SourceMeta {
  provider: string;
  fetchedAt: string;
  network?: string;
  requestId?: string;
}

export interface ProviderResult<T> {
  data: T;
  source: SourceMeta;
}

export type ProviderCapability =
  | "ai"
  | "market"
  | "blockchain"
  | "token"
  | "analytics"
  | "exchange"
  | "smart-money";

// Canonical Zod Schemas
export const TokenMarketDataSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  priceUsd: z.number(),
  change24h: z.number(),
  volume24h: z.number(),
  marketCap: z.number().optional(),
  high24h: z.number().optional(),
  low24h: z.number().optional(),
  lastUpdated: z.string(),
});
export type TokenMarketData = z.infer<typeof TokenMarketDataSchema>;

export const PricePointSchema = z.object({
  timestamp: z.number(),
  price: z.number(),
  volume: z.number().optional(),
});
export type PricePoint = z.infer<typeof PricePointSchema>;

/** Lightweight coin descriptor used by the market scanner / TradingView selector. */
export const CoinSummarySchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  priceUsd: z.number().optional(),
  change24h: z.number().optional(),
  marketCap: z.number().optional(),
  volume24h: z.number().optional(),
  marketCapRank: z.number().optional(),
  image: z.string().optional(),
  /** TradingView symbol, e.g. BINANCE:BTCUSDT â€” resolved from exchange mappings. */
  tradingViewSymbol: z.string().optional(),
});
export type CoinSummary = z.infer<typeof CoinSummarySchema>;

export interface CoinListQuery {
  page?: number;
  perPage?: number;
  /** Free-text search across symbol and name. */
  search?: string;
  /** Optional ISO currency (defaults to usd). */
  currency?: string;
  /** Sort key, e.g. market_cap_desc. */
  order?: string;
}

export const TokenHoldingSchema = z.object({
  symbol: z.string(),
  contractAddress: z.string(),
  name: z.string(),
  balance: stringOrNumber(),
  balanceFormatted: z.string(),
  usdValue: z.number().optional(),
});
function stringOrNumber() {
  return z.union([z.string(), z.number()]);
}
export type TokenHolding = z.infer<typeof TokenHoldingSchema>;

export const WalletBalanceSchema = z.object({
  address: z.string(),
  network: z.string(),
  nativeBalance: z.string(),
  nativeSymbol: z.string(),
  usdValue: z.number().optional(),
  tokens: z.array(TokenHoldingSchema).default([]),
});
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;

export const TransactionSchema = z.object({
  hash: z.string(),
  blockNumber: z.number().optional(),
  timestamp: z.string(),
  from: z.string(),
  to: z.string().nullable().default(""),
  value: z.string(),
  fee: z.string().optional(),
  status: z.enum(["success", "failed", "pending"]),
  network: z.string(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const TransactionDetailSchema = TransactionSchema.extend({
  gasUsed: z.string().optional(),
  gasPrice: z.string().optional(),
  inputData: z.string().optional(),
  logsCount: z.number().optional(),
});
export type TransactionDetail = z.infer<typeof TransactionDetailSchema>;

export const ContractInfoSchema = z.object({
  address: z.string(),
  network: z.string(),
  name: z.string().optional(),
  verified: z.boolean(),
  compilerVersion: z.string().optional(),
  creatorAddress: z.string().optional(),
  creationTxHash: z.string().optional(),
  abiSummary: z.string().optional(),
});
export type ContractInfo = z.infer<typeof ContractInfoSchema>;

export const HolderInfoSchema = z.object({
  address: z.string(),
  balance: z.string(),
  percentage: z.number().optional(),
  isContract: z.boolean().optional(),
});
export type HolderInfo = z.infer<typeof HolderInfoSchema>;

export const AnalyticsResultSchema = z.object({
  queryId: z.union([z.string(), z.number()]),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number(),
  executionTimeMs: z.number(),
});
export type AnalyticsResult = z.infer<typeof AnalyticsResultSchema>;

// â”€â”€ Smart-money intelligence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Fetch options shared by every smart-money provider. */
export interface SmartMoneyQuery {
  chains?: string[];
  /** Max rows to return (each provider caps this). */
  limit?: number;
  /** Restrict to specific token contracts / symbols. */
  tokenAddresses?: string[];
  tokenSymbols?: string[];
  /** Minimum USD value for holdings/netflow filters. */
  minValueUsd?: number;
}

export const SmartMoneyChainEnum = z.enum([
  "ethereum",
  "solana",
  "base",
  "arbitrum",
  "polygon",
  "bnb",
  "avalanche",
]);
export type SmartMoneyChain = z.infer<typeof SmartMoneyChainEnum>;

/** Aggregated exposure of labelled "smart money" wallets to one token. */
export const SmartMoneyHoldingSchema = z.object({
  chain: z.string(),
  tokenAddress: z.string(),
  tokenSymbol: z.string(),
  sectors: z.array(z.string()).default([]),
  valueUsd: z.number(),
  balance24hPercentChange: z.number().optional(),
  holdersCount: z.number().optional(),
  shareOfHoldingsPercent: z.number().optional(),
  tokenAgeDays: z.number().optional(),
  marketCapUsd: z.number().optional(),
});
export type SmartMoneyHolding = z.infer<typeof SmartMoneyHoldingSchema>;

/** Net token flow attributed to a smart-money cohort over a window. */
export const SmartMoneyNetflowSchema = z.object({
  chain: z.string(),
  tokenAddress: z.string(),
  tokenSymbol: z.string().optional(),
  /** Positive = net inflow, negative = net outflow, in USD. */
  netflowUsd: z.number(),
  netflow24hChangePercent: z.number().optional(),
  tradersCount: z.number().optional(),
});
export type SmartMoneyNetflow = z.infer<typeof SmartMoneyNetflowSchema>;

/** One transfer made by a single labelled wallet (wallet-level dataset). */
export const SmartMoneyWalletFlowSchema = z.object({
  wallet: z.string(),
  chain: z.string(),
  tokenSymbol: z.string().optional(),
  tokenAddress: z.string().optional(),
  /** Positive = received, negative = sent, in USD. */
  valueUsd: z.number(),
  direction: z.enum(["inflow", "outflow"]),
  counterparty: z.string().optional(),
  timestamp: z.string().optional(),
});
export type SmartMoneyWalletFlow = z.infer<typeof SmartMoneyWalletFlowSchema>;

export const TickerDataSchema = z.object({
  symbol: z.string(),
  lastPrice: z.number(),
  highPrice: z.number().optional(),
  lowPrice: z.number().optional(),
  volume: z.number(),
  openPrice: z.number().optional(),
  change24h: z.number(),
  timestamp: z.string(),
});
export type TickerData = z.infer<typeof TickerDataSchema>;

export interface TokenQuery {
  symbol?: string;
  address?: string;
  network?: string;
}

export interface TimeRange {
  days: number;
}

export interface Pagination {
  page?: number;
  limit?: number;
}

export interface AnalyticsQuery {
  queryId: string | number;
  parameters?: Record<string, unknown>;
}

// AI & Agent Interfaces
export interface ToolCallRequest {
  id?: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinitionItem {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
  /** Tool call ids being requested (assistant) â€” used for provider round-tripping. */
  toolCalls?: ToolCallRequest[];
  /** For role === "tool": the id of the tool call this result answers. */
  toolCallId?: string;
}

export interface AgentInput {
  messages: AgentMessage[];
  tools?: ToolDefinitionItem[];
  temperature?: number;
  stream?: boolean;
}

export interface AgentOutput {
  text: string;
  toolCalls?: ToolCallRequest[];
  model: string;
  sourceMeta: SourceMeta;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface IBaseProvider {
  id: string;
  name: string;
  capability: ProviderCapability;
  requiredEnvVars: string[];
  healthCheck(): Promise<boolean>;
}

export interface AIProvider extends IBaseProvider {
  capability: ProviderCapability;
  generateResponse(input: AgentInput): Promise<AgentOutput>;
}

export interface MarketDataProvider extends IBaseProvider {
  capability: ProviderCapability;
  getTokenMarketData(query: string | TokenQuery): Promise<ProviderResult<TokenMarketData>>;
  getTokenPriceHistory(symbol: string, timeframe?: string): Promise<ProviderResult<PricePoint[]>>;
  getMarketHistory?(query: TokenQuery, range: TimeRange): Promise<ProviderResult<PricePoint[]>>;
  /**
   * Whether this provider can serve historical series. Adapters that cannot
   * (e.g. CoinMarketCap) set this to false so history falls back correctly.
   */
  supportsHistory?: boolean;
  /** Optional: enumerate coins (1000+ on CoinGecko) for scanner / selector UIs. */
  getCoinList?(query: CoinListQuery): Promise<ProviderResult<CoinSummary[]>>;
}

export interface BlockchainDataProvider extends IBaseProvider {
  capability: ProviderCapability;
  supportedNetworks: string[];
  getWalletBalance(address: string, network: string): Promise<ProviderResult<WalletBalance>>;
  getWalletTransactions(
    address: string,
    network: string,
    page?: Pagination
  ): Promise<ProviderResult<Transaction[]>>;
  getTransactionInformation(
    txHash: string,
    network: string
  ): Promise<ProviderResult<TransactionDetail>>;
  getContractInformation(
    address: string,
    network: string
  ): Promise<ProviderResult<ContractInfo>>;
  getTokenHolders?(
    address: string,
    network: string
  ): Promise<ProviderResult<HolderInfo[]>>;
}

export interface TokenDataProvider extends IBaseProvider {
  capability: ProviderCapability;
  supportedNetworks: string[];
  getTokenHolders(
    address: string,
    network: string
  ): Promise<ProviderResult<HolderInfo[]>>;
}

export interface AnalyticsProvider extends IBaseProvider {
  capability: ProviderCapability;
  runAnalyticsQuery(query: AnalyticsQuery): Promise<ProviderResult<AnalyticsResult>>;
}

export interface ExchangeDataProvider extends IBaseProvider {
  capability: ProviderCapability;
  getExchangeTicker(symbol: string): Promise<ProviderResult<TickerData>>;
}

/**
 * Labelled-wallet intelligence ("smart money"). Only providers that actually
 * label wallets implement this; RPC/explorer adapters must not.
 */
export interface SmartMoneyProvider extends IBaseProvider {
  capability: ProviderCapability;
  supportedChains: string[];
  getSmartMoneyNetflows(query?: SmartMoneyQuery): Promise<ProviderResult<SmartMoneyNetflow[]>>;
  getSmartMoneyHoldings(query?: SmartMoneyQuery): Promise<ProviderResult<SmartMoneyHolding[]>>;
  /**
   * Individual labelled wallets. Optional: Nansen's public smart-money
   * endpoints aggregate by token, so the adapter leaves this undefined and the
   * executor reports "unsupported" rather than inventing wallet identities.
   */
  getSmartMoneyWallets?(query?: SmartMoneyQuery): Promise<ProviderResult<SmartMoneyWallet[]>>;
  /** Transfers made by one labelled wallet. Optional: only label providers have it. */
  getSmartMoneyWalletFlows?(
    query: { wallet: string; direction?: "inflow" | "outflow" | "all"; chain?: string; limit?: number }
  ): Promise<ProviderResult<SmartMoneyWalletFlow[]>>;
}

/** Minimal wallet record used by providers that can enumerate labelled wallets. */
export const SmartMoneyWalletSchema = z.object({
  address: z.string(),
  chain: z.string(),
  label: z.string(),
  category: z.string().optional(),
  pnlUsd: z.number().optional(),
  winRate: z.number().optional(),
  tradesCount: z.number().optional(),
});
export type SmartMoneyWallet = z.infer<typeof SmartMoneyWalletSchema>;
