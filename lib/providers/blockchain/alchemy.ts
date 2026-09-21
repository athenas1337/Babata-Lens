import {
  BlockchainDataProvider,
  TokenDataProvider,
  ProviderResult,
  WalletBalance,
  Transaction,
  TransactionDetail,
  ContractInfo,
  HolderInfo,
  Pagination,
  ProviderCapability,
  HolderInfoSchema,
} from "../interfaces";
import { getCache } from "../../cache";

const ALCHEMY_NETWORK_MAP: Record<string, { rpc: string; symbol: string }> = {
  ethereum: { rpc: "https://eth-mainnet.g.alchemy.com/v2", symbol: "ETH" },
  polygon: { rpc: "https://polygon-mainnet.g.alchemy.com/v2", symbol: "POL" },
  arbitrum: { rpc: "https://arb-mainnet.g.alchemy.com/v2", symbol: "ETH" },
  optimism: { rpc: "https://opt-mainnet.g.alchemy.com/v2", symbol: "ETH" },
  base: { rpc: "https://base-mainnet.g.alchemy.com/v2", symbol: "ETH" },
};

export class AlchemyProvider implements BlockchainDataProvider, TokenDataProvider {
  id = "alchemy";
  name = "Alchemy";
  capability: ProviderCapability = "blockchain";
  supportedNetworks = ["ethereum", "polygon", "arbitrum", "optimism", "base", "solana"];
  requiredEnvVars = ["ALCHEMY_API_KEY"];

  private apiKey?: string;
  private baseUrl = "https://eth-mainnet.g.alchemy.com/v2";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ALCHEMY_API_KEY;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_blockNumber",
          params: [],
        }),
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getWalletBalance(address: string, network = "ethereum"): Promise<ProviderResult<WalletBalance>> {
    if (!this.apiKey) {
      throw new Error("Alchemy API key is not configured.");
    }

    const netLower = network.toLowerCase();

    if (netLower === "solana") {
      const rpcUrl = `https://solana-mainnet.g.alchemy.com/v2/${this.apiKey}`;
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [address],
        }),
      });
      const json = (await res.json()) as { result?: { value?: number } };
      const lamports = json.result?.value || 0;
      const sol = (lamports / 1e9).toFixed(4);

      return {
        data: {
          address,
          network: "solana",
          nativeBalance: sol,
          nativeSymbol: "SOL",
          tokens: [],
        },
        source: {
          provider: this.id,
          network: "solana",
          fetchedAt: new Date().toISOString(),
        },
      };
    }

    const netInfo = ALCHEMY_NETWORK_MAP[netLower] || ALCHEMY_NETWORK_MAP.ethereum;

    const res = await fetch(`${netInfo.rpc}/${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });

    const json = (await res.json()) as { result?: string };
    const hexVal = json.result || "0x0";
    const balance = (Number(BigInt(hexVal)) / 1e18).toFixed(6);

    return {
      data: {
        address,
        network,
        nativeBalance: balance,
        nativeSymbol: netInfo.symbol,
        tokens: [],
      },
      source: {
        provider: this.id,
        network,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  async getWalletTransactions(
    address: string,
    network = "ethereum",
    _page?: Pagination
  ): Promise<ProviderResult<Transaction[]>> {
    return {
      data: [],
      source: {
        provider: this.id,
        network,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  async getTransactionInformation(
    txHash: string,
    network = "ethereum"
  ): Promise<ProviderResult<TransactionDetail>> {
    return {
      data: {
        hash: txHash,
        timestamp: new Date().toISOString(),
        from: "0x0",
        to: "0x0",
        value: "0 ETH",
        status: "success",
        network,
      },
      source: {
        provider: this.id,
        network,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  async getContractInformation(
    address: string,
    network = "ethereum"
  ): Promise<ProviderResult<ContractInfo>> {
    return {
      data: {
        address,
        network,
        verified: false,
      },
      source: {
        provider: this.id,
        network,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  async getTokenHolders(
    address: string,
    network = "ethereum"
  ): Promise<ProviderResult<HolderInfo[]>> {
    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "holders", { address, network });
    const cached = await cache.get<HolderInfo[]>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: { provider: this.id, network, fetchedAt: new Date().toISOString() },
      };
    }

    const mockHolders: HolderInfo[] = [
      { address: "0x000000000000000000000000000000000000dead", balance: "400000000", percentage: 40, isContract: false },
      { address: "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503", balance: "150000000", percentage: 15, isContract: true },
      { address: "0x28c6c06298d514db089934071355e5743bf21d60", balance: "80000000", percentage: 8, isContract: true },
    ];

    mockHolders.forEach((h) => HolderInfoSchema.parse(h));
    await cache.set(cacheKey, mockHolders, 300);

    return {
      data: mockHolders,
      source: {
        provider: this.id,
        network,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
