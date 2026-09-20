import { initializeProviderRegistry } from "../providers";
import {
  MarketDataProvider,
  BlockchainDataProvider,
  AnalyticsProvider,
  ExchangeDataProvider,
} from "../providers/interfaces";
import {
  GetTokenMarketDataSchema,
  GetTokenPriceHistorySchema,
  GetWalletBalanceSchema,
  GetWalletTransactionsSchema,
  GetTransactionDetailsSchema,
  GetContractAbiInfoSchema,
  GetTokenHolderDistributionSchema,
  RunDuneAnalyticsSchema,
  GetExchangeTickerSchema,
} from "./definitions";
import { formatToolOutputForAgent, validateAddress, validateTxHash } from "../security/sanitization";
import { logger } from "../observability/logger";

export interface ToolExecutionResult {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  formattedOutput: string;
  durationMs: number;
  success: boolean;
  error?: string;
  source?: {
    provider: string;
    timestamp: string;
  };
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const start = Date.now();
  const registry = initializeProviderRegistry();

  try {
    let resultData: unknown;
    let sourceMeta: { provider: string; timestamp: string } | undefined;

    switch (toolName) {
      case "get_token_market_data": {
        const parsed = GetTokenMarketDataSchema.parse(input);
        const provider = await registry.resolveProvider<MarketDataProvider>("market");
        if (!provider) throw new Error("No available market data provider.");
        const res = await provider.getTokenMarketData(parsed.symbolOrAddress);
        resultData = res.data;
        sourceMeta = { provider: res.source.provider, timestamp: res.source.fetchedAt };
        break;
      }

      case "get_token_price_history": {
        const parsed = GetTokenPriceHistorySchema.parse(input);
        const provider = await registry.resolveProvider<MarketDataProvider>("market");
        if (!provider) throw new Error("No available market data provider.");
        const res = await provider.getTokenPriceHistory(parsed.symbol, parsed.timeframe);
        resultData = res.data;
        sourceMeta = { provider: res.source.provider, timestamp: res.source.fetchedAt };
        break;
      }

      case "get_wallet_balance": {
        const parsed = GetWalletBalanceSchema.parse(input);
        const validAddr = validateAddress(parsed.address, parsed.network);
        if (!validAddr.valid) {
          throw new Error(`Invalid address format: ${validAddr.error}`);
        }
        const provider = await registry.resolveProvider<BlockchainDataProvider>(
          "blockchain",
          parsed.network
        );
        if (!provider) throw new Error(`No available blockchain provider for network ${parsed.network}.`);
        const res = await provider.getWalletBalance(parsed.address, parsed.network);
        resultData = res.data;
        sourceMeta = { provider: res.source.provider, timestamp: res.source.fetchedAt };
        break;
      }

      case "get_wallet_transactions": {
        const parsed = GetWalletTransactionsSchema.parse(input);
        const validAddr = validateAddress(parsed.address, parsed.network);
        if (!validAddr.valid) {
          throw new Error(`Invalid address format: ${validAddr.error}`);
        }
        const provider = await registry.resolveProvider<BlockchainDataProvider>(
          "blockchain",
          parsed.network
        );
        if (!provider) throw new Error(`No available blockchain provider for network ${parsed.network}.`);
        const res = await provider.getWalletTransactions(parsed.address, parsed.network, {
          limit: parsed.limit,
        });
        resultData = res.data;
        sourceMeta = { provider: res.source.provider, timestamp: res.source.fetchedAt };
        break;
      }

      case "get_transaction_details": {
        const parsed = GetTransactionDetailsSchema.parse(input);
        const validHash = validateTxHash(parsed.txHash, parsed.network);
        if (!validHash.valid) {
          throw new Error(`Invalid transaction hash: ${validHash.error}`);
        }
        const provider = await registry.resolveProvider<BlockchainDataProvider>(
          "blockchain",
          parsed.network
        );
        if (!provider) throw new Error(`No available blockchain provider for network ${parsed.network}.`);
        const res = await provider.getTransactionInformation(parsed.txHash, parsed.network);
        resultData = res.data;
        sourceMeta = { provider: res.source.provider, timestamp: res.source.fetchedAt };
        break;
      }

      case "get_contract_abi_info": {
        const parsed = GetContractAbiInfoSchema.parse(input);
        const validAddr = validateAddress(parsed.address, parsed.network);
        if (!validAddr.valid) {
          throw new Error(`Invalid contract address: ${validAddr.error}`);
        }
        const provider = await registry.resolveProvider<BlockchainDataProvider>(
          "blockchain",
          parsed.network
        );
        if (!provider) throw new Error(`No available blockchain provider for network ${parsed.network}.`);
        const res = await provider.getContractInformation(parsed.address, parsed.network);
        resultData = res.data;
        sourceMeta = { provider: res.source.provider, timestamp: res.source.fetchedAt };
        break;
      }

      case "get_token_holder_distribution": {
        const parsed = GetTokenHolderDistributionSchema.parse(input);
        const validAddr = validateAddress(parsed.address, parsed.network);
        if (!validAddr.valid) {
          throw new Error(`Invalid contract address: ${validAddr.error}`);
        }
        const provider = await registry.resolveProvider<BlockchainDataProvider>(
          "blockchain",
          parsed.network
        );
        if (!provider) throw new Error(`No available blockchain provider for network ${parsed.network}.`);
        if (!provider.getTokenHolders) {
          throw new Error(`Provider ${provider.name} does not support token holder distribution.`);
        }
        const res = await provider.getTokenHolders(parsed.address, parsed.network);
        resultData = res.data;
        sourceMeta = { provider: res.source.provider, timestamp: res.source.fetchedAt };
        break;
      }

      case "run_dune_analytics": {
        const parsed = RunDuneAnalyticsSchema.parse(input);
        const provider = await registry.resolveProvider<AnalyticsProvider>("analytics");
        if (!provider) throw new Error("No available analytics provider.");
        const res = await provider.runAnalyticsQuery({ queryId: parsed.queryId });
        resultData = res.data;
        sourceMeta = { provider: res.source.provider, timestamp: res.source.fetchedAt };
        break;
      }

      case "get_exchange_ticker": {
        const parsed = GetExchangeTickerSchema.parse(input);
        const provider = await registry.resolveProvider<ExchangeDataProvider>("exchange");
        if (!provider) throw new Error("No available exchange data provider.");
        const res = await provider.getExchangeTicker(parsed.symbol);
        resultData = res.data;
        sourceMeta = { provider: res.source.provider, timestamp: res.source.fetchedAt };
        break;
      }

      default:
        throw new Error(`Unrecognized tool: ${toolName}`);
    }

    const durationMs = Date.now() - start;
    const formattedOutput = formatToolOutputForAgent(toolName, resultData);

    return {
      tool: toolName,
      input,
      output: resultData,
      formattedOutput,
      durationMs,
      success: true,
      source: sourceMeta,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Tool execution failed: ${toolName}`, {
      errorCode: "TOOL_EXEC_FAILED",
      latencyMs: durationMs,
      data: { error: errorMsg },
    });

    const formattedOutput = formatToolOutputForAgent(toolName, { error: errorMsg });

    return {
      tool: toolName,
      input,
      output: { error: errorMsg },
      formattedOutput,
      durationMs,
      success: false,
      error: errorMsg,
    };
  }
}
