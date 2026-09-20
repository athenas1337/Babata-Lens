import { getProviderRegistry, ProviderRegistry } from "./registry";
import { AnthropicProvider } from "./ai/anthropic";
import { OpenRouterProvider } from "./ai/openrouter";
import { GoogleAIProvider } from "./ai/google";
import { LocalBabataEngine } from "./ai/local-rule-engine";
import { CoinGeckoProvider } from "./market/coingecko";
import { CoinMarketCapProvider } from "./market/coinmarketcap";
import { EtherscanProvider } from "./blockchain/etherscan";
import { AlchemyProvider } from "./blockchain/alchemy";
import { SolscanProvider } from "./blockchain/solscan";
import { DuneAnalyticsProvider } from "./analytics/dune";
import { BingXProvider } from "./exchange/bingx";

let initialized = false;

export function initializeProviderRegistry(): ProviderRegistry {
  const registry = getProviderRegistry();
  if (initialized) return registry;

  // AI Providers
  registry.registerProvider(new AnthropicProvider(), {
    id: "anthropic",
    name: "Anthropic Claude",
    capability: "ai",
    priority: 100,
    enabled: true,
    requiredEnvVars: ["ANTHROPIC_API_KEY"],
    timeoutMs: 30000,
    rateLimitPerMinute: 60,
  });

  registry.registerProvider(new OpenRouterProvider(), {
    id: "openrouter",
    name: "OpenRouter",
    capability: "ai",
    priority: 80,
    enabled: true,
    requiredEnvVars: ["OPENROUTER_API_KEY"],
    timeoutMs: 30000,
    rateLimitPerMinute: 60,
  });

  registry.registerProvider(new GoogleAIProvider(), {
    id: "google",
    name: "Google Gemini",
    capability: "ai",
    priority: 70,
    enabled: true,
    requiredEnvVars: ["GOOGLE_AI_API_KEY"],
    timeoutMs: 30000,
    rateLimitPerMinute: 60,
  });

  registry.registerProvider(new LocalBabataEngine(), {
    id: "local-babata",
    name: "Babata Local Intelligence Engine",
    capability: "ai",
    priority: 10,
    enabled: true,
    requiredEnvVars: [],
    timeoutMs: 5000,
    rateLimitPerMinute: 120,
  });

  // Market Providers
  registry.registerProvider(new CoinGeckoProvider(), {
    id: "coingecko",
    name: "CoinGecko",
    capability: "market",
    priority: 100,
    enabled: true,
    requiredEnvVars: [],
    timeoutMs: 10000,
    rateLimitPerMinute: 30,
  });

  registry.registerProvider(new CoinMarketCapProvider(), {
    id: "coinmarketcap",
    name: "CoinMarketCap",
    capability: "market",
    priority: 90,
    enabled: true,
    requiredEnvVars: ["COINMARKETCAP_API_KEY"],
    timeoutMs: 10000,
    rateLimitPerMinute: 30,
  });

  // Blockchain Providers
  registry.registerProvider(new EtherscanProvider(), {
    id: "etherscan",
    name: "Etherscan",
    capability: "blockchain",
    priority: 100,
    enabled: true,
    supportedNetworks: ["ethereum", "polygon", "arbitrum", "optimism", "base"],
    requiredEnvVars: [],
    timeoutMs: 12000,
    rateLimitPerMinute: 30,
  });

  registry.registerProvider(new AlchemyProvider(), {
    id: "alchemy",
    name: "Alchemy",
    capability: "blockchain",
    priority: 90,
    enabled: true,
    supportedNetworks: ["ethereum", "polygon", "arbitrum", "optimism", "base", "solana"],
    requiredEnvVars: ["ALCHEMY_API_KEY"],
    timeoutMs: 12000,
    rateLimitPerMinute: 60,
  });

  registry.registerProvider(new SolscanProvider(), {
    id: "solscan",
    name: "Solscan",
    capability: "blockchain",
    priority: 100,
    enabled: true,
    supportedNetworks: ["solana"],
    requiredEnvVars: ["SOLSCAN_API_KEY"],
    timeoutMs: 12000,
    rateLimitPerMinute: 30,
  });

  // Analytics Provider
  registry.registerProvider(new DuneAnalyticsProvider(), {
    id: "dune",
    name: "Dune Analytics",
    capability: "analytics",
    priority: 100,
    enabled: true,
    requiredEnvVars: [],
    timeoutMs: 25000,
    rateLimitPerMinute: 20,
  });

  // Exchange Provider
  registry.registerProvider(new BingXProvider(), {
    id: "bingx",
    name: "BingX Exchange",
    capability: "exchange",
    priority: 100,
    enabled: true,
    requiredEnvVars: [],
    timeoutMs: 8000,
    rateLimitPerMinute: 60,
  });

  initialized = true;
  return registry;
}
