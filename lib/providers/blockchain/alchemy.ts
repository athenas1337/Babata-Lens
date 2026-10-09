import {
  BlockchainDataProvider,
  ProviderResult,
  WalletBalance,
  Transaction,
  TransactionDetail,
  ContractInfo,
  Pagination,
  ProviderCapability,
  ContractInfoSchema,
} from "../interfaces";

const ALCHEMY_NETWORK_MAP: Record<string, { rpc: string; symbol: string }> = {
  ethereum: { rpc: "https://eth-mainnet.g.alchemy.com/v2", symbol: "ETH" },
  polygon: { rpc: "https://polygon-mainnet.g.alchemy.com/v2", symbol: "POL" },
  arbitrum: { rpc: "https://arb-mainnet.g.alchemy.com/v2", symbol: "ETH" },
  optimism: { rpc: "https://opt-mainnet.g.alchemy.com/v2", symbol: "ETH" },
  base: { rpc: "https://base-mainnet.g.alchemy.com/v2", symbol: "ETH" },
};

export class AlchemyProvider implements BlockchainDataProvider {
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

  async rpc(network: string, method: string, params: unknown[]): Promise<unknown> {
    if (!this.apiKey) throw new Error("Alchemy API key is not configured.");
    const netLower = network.toLowerCase();
    const rpcUrl =
      netLower === "solana"
        ? `https://solana-mainnet.g.alchemy.com/v2/${this.apiKey}`
        : `${(ALCHEMY_NETWORK_MAP[netLower] || ALCHEMY_NETWORK_MAP.ethereum).rpc}/${this.apiKey}`;

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) {
      throw new Error(`Alchemy RPC request failed with status ${res.status}`);
    }
    const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error) {
      throw new Error(`Alchemy RPC error: ${json.error.message || "unknown error"}`);
    }
    return json.result;
  }

  async getWalletTransactions(
    address: string,
    network = "ethereum",
    page?: Pagination
  ): Promise<ProviderResult<Transaction[]>> {
    if (!this.apiKey) {
      throw new Error("Alchemy API key is not configured.");
    }
    if (network.toLowerCase() === "solana") {
      // Alchemy Solana RPC does not expose an equivalent transfer-history index here.
      throw new Error("Alchemy does not support Solana transfer history; use Solscan.");
    }

    const limit = Math.min(Math.max(page?.limit || 10, 1), 50);
    const result = (await this.rpc(network, "alchemy_getAssetTransfers", [
      {
        fromAddress: address,
        category: ["external", "erc20"],
        maxCount: `0x${limit.toString(16)}`,
        order: "desc",
        withMetadata: true,
      },
    ])) as {
      transfers?: {
        hash: string;
        blockNum: string;
        from: string;
        to: string | null;
        value: number | null;
        asset: string | null;
        metadata?: { blockTimestamp?: string };
      }[];
    };

    const transfers = result?.transfers || [];
    const transactions: Transaction[] = transfers.map((t) => {
      let status: "success" | "failed" | "pending" = "success";
      if (!t.blockNum || t.blockNum === "0x0") status = "pending";
      return {
        hash: t.hash,
        blockNumber: t.blockNum ? Number(BigInt(t.blockNum)) : undefined,
        timestamp: t.metadata?.blockTimestamp || new Date().toISOString(),
        from: t.from,
        to: t.to ?? "",
        value: `${t.value ?? 0} ${t.asset ?? ""}`.trim(),
        status,
        network,
      };
    });

    return {
      data: transactions,
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
    if (!this.apiKey) {
      throw new Error("Alchemy API key is not configured.");
    }
    if (network.toLowerCase() === "solana") {
      throw new Error("Alchemy does not support Solana transaction lookup; use Solscan.");
    }

    const tx = (await this.rpc(network, "eth_getTransactionByHash", [txHash])) as {
      blockNumber?: string | null;
      from?: string;
      to?: string | null;
      value?: string;
      gas?: string;
      gasPrice?: string;
      input?: string;
    } | null;

    if (!tx) {
      throw new Error(`Transaction ${txHash} not found on ${network}.`);
    }

    const receipt = (await this.rpc(network, "eth_getTransactionReceipt", [txHash])) as {
      status?: string;
      gasUsed?: string;
      logs?: unknown[];
    } | null;

    let timestamp = new Date().toISOString();
    if (tx.blockNumber) {
      const block = (await this.rpc(network, "eth_getBlockByNumber", [tx.blockNumber, false])) as {
        timestamp?: string;
      } | null;
      if (block?.timestamp) {
        timestamp = new Date(Number(BigInt(block.timestamp)) * 1000).toISOString();
      }
    }

    // Determine status strictly from on-chain receipt data. Never assume success.
    let status: "success" | "failed" | "pending" = "pending";
    if (receipt?.status === "0x1") status = "success";
    else if (receipt?.status === "0x0") status = "failed";
    else if (tx.blockNumber && !receipt) status = "pending";

    const wei = BigInt(tx.value || "0x0");
    const valueFormatted = `${(Number(wei) / 1e18).toFixed(6)} ETH`;

    const detail: TransactionDetail = {
      hash: txHash,
      blockNumber: tx.blockNumber ? Number(BigInt(tx.blockNumber)) : undefined,
      timestamp,
      from: tx.from || "0x0",
      to: tx.to ?? "",
      value: valueFormatted,
      gasUsed: receipt?.gasUsed ? String(Number(BigInt(receipt.gasUsed))) : undefined,
      gasPrice: tx.gasPrice ? String(Number(BigInt(tx.gasPrice))) : undefined,
      inputData: tx.input,
      logsCount: receipt?.logs?.length ?? 0,
      status,
      network,
    };

    return {
      data: detail,
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
    if (!this.apiKey) {
      throw new Error("Alchemy API key is not configured.");
    }
    if (network.toLowerCase() === "solana") {
      throw new Error("Alchemy does not support EVM contract metadata on Solana; use Solscan.");
    }

    const code = (await this.rpc(network, "eth_getCode", [address, "latest"])) as string | null;
    const hasCode = !!code && code !== "0x";

    const info: ContractInfo = {
      address,
      network,
      verified: false, // Alchemy RPC cannot confirm source verification; use Etherscan.
      abiSummary: hasCode
        ? "Contract bytecode present. Source verification status requires Etherscan."
        : "No contract bytecode at this address (EOA or non-contract).",
    };

    ContractInfoSchema.parse(info);

    return {
      data: info,
      source: {
        provider: this.id,
        network,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  // NOTE: Alchemy RPC does not expose token holder distribution (that is an
  // indexer feature). `getTokenHolders` is intentionally not implemented so the
  // executor reports an explicit "unsupported" error instead of fake holders.
}
