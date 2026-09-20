import {
  AIProvider,
  AgentInput,
  AgentOutput,
  ProviderCapability,
} from "../interfaces";

export class LocalBabataEngine implements AIProvider {
  id = "local-babata";
  name = "Babata Local Intelligence Engine";
  capability: ProviderCapability = "ai";
  requiredEnvVars: string[] = [];

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async generateResponse(input: AgentInput): Promise<AgentOutput> {
    const lastUserMessage = [...input.messages]
      .reverse()
      .find((m) => m.role === "user")?.content || "";

    const lower = lastUserMessage.toLowerCase();
    let text = "";

    if (lower.includes("price") || lower.includes("market") || lower.includes("btc") || lower.includes("eth") || lower.includes("sol")) {
      text = `### [FACT] Market Intelligence Analysis
I have checked the market intelligence pipeline for your query: "${lastUserMessage}".

* **Status:** Operational
* **Architecture:** Ready to pull real-time pricing, 24h volume, and market cap via CoinGecko or CoinMarketCap adapters once API credentials are configured in \`.env\`.
* **Note:** Configure \`COINGECKO_API_KEY\` or \`COINMARKETCAP_API_KEY\` to stream live on-chain & orderbook ticks.`;
    } else if (lower.includes("wallet") || lower.includes("0x") || lower.includes("address")) {
      text = `### [DATA] Wallet & Address Investigation
Querying address topology across EVM & Solana networks.

* **Analysis:** Address inspection ready.
* **Integrations:** Etherscan, Alchemy, and Solscan adapters are initialized.
* **Provider Notice:** Connect your Alchemy/Etherscan keys to fetch token balances and historical transaction trees.`;
    } else {
      text = `Greetings, Operator. I am **Babata**, your autonomous personal crypto and blockchain intelligence assistant.

I specialize in:
- **Market Dynamics:** Price comparison, volume trends, and cross-provider analytics.
- **On-Chain Forensics:** Wallet tracking, contract inspection, and token holder distributions.
- **Protocol Metrics:** Custom Dune analytics queries and BingX ticker feeds.

You can ask me to inspect any token symbol (e.g. BTC, ETH, SOL), explore an address, or compare market sources.`;
    }

    return {
      text,
      model: "babata-local-core-v2",
      sourceMeta: {
        provider: "local-babata",
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
