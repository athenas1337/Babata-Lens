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
  | "exchange";

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
  toolCalls?: ToolCallRequest[];
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
