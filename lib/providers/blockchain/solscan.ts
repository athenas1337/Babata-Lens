import {
  BlockchainDataProvider,
  ProviderResult,
  WalletBalance,
  Transaction,
  TransactionDetail,
  ContractInfo,
  Pagination,
  ProviderCapability,
} from "../interfaces";

export class SolscanProvider implements BlockchainDataProvider {
  id = "solscan";
  name = "Solscan";
  capability: ProviderCapability = "blockchain";
  supportedNetworks = ["solana"];
  requiredEnvVars = ["SOLSCAN_API_KEY"];

  private apiKey?: string;
  private baseUrl = "https://pro-api.solscan.io/v2.0";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SOLSCAN_API_KEY;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/chaininfo`, {
        headers: { token: this.apiKey },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getWalletBalance(address: string, network = "solana"): Promise<ProviderResult<WalletBalance>> {
    if (!this.apiKey) {
      throw new Error("Solscan API key is not configured.");
    }

    const res = await fetch(`${this.baseUrl}/account/detail?address=${address}`, {
      headers: { token: this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Solscan balance query failed with status ${res.status}`);
    }

    const json = (await res.json()) as { data?: { lamports?: number } };
    const sol = ((json.data?.lamports || 0) / 1e9).toFixed(4);

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
        network,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  async getWalletTransactions(
    address: string,
    network = "solana",
    page?: Pagination
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
    network = "solana"
  ): Promise<ProviderResult<TransactionDetail>> {
    return {
      data: {
        hash: txHash,
        timestamp: new Date().toISOString(),
        from: "unknown",
        to: "unknown",
        value: "0 SOL",
        status: "success",
        network: "solana",
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
    network = "solana"
  ): Promise<ProviderResult<ContractInfo>> {
    return {
      data: {
        address,
        network: "solana",
        verified: true,
        name: "Solana Program",
      },
      source: {
        provider: this.id,
        network,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
