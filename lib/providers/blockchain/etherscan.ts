import { z } from "zod";
import {
  BlockchainDataProvider,
  ProviderResult,
  WalletBalance,
  Transaction,
  TransactionDetail,
  ContractInfo,
  HolderInfo,
  Pagination,
  ProviderCapability,
  WalletBalanceSchema,
  TransactionDetailSchema,
  ContractInfoSchema,
} from "../interfaces";
import { logger } from "../../observability/logger";
import { getCache } from "../../cache";
import { getSecret } from "../../config/env";

const EtherscanBalanceSchema = z.object({
  status: z.string(),
  message: z.string(),
  result: z.string(),
});

const EtherscanTxListSchema = z.object({
  status: z.string(),
  message: z.string(),
  result: z.union([
    z.string(),
    z.array(
      z.object({
        hash: z.string(),
        blockNumber: z.string(),
        timeStamp: z.string(),
        from: z.string(),
        to: z.string(),
        value: z.string(),
        gasUsed: z.string().optional(),
        gasPrice: z.string().optional(),
        isError: z.string().optional(),
      })
    ),
  ]),
});

const CHAIN_ID_MAP: Record<string, number> = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
};

function getChainId(network: string): number {
  return CHAIN_ID_MAP[network.toLowerCase()] || 1;
}

/** Etherscan requires a key on v2 API; provider is gated on it. */
function requireKey(key: string | undefined): string {
  if (!key) {
    throw new Error(
      "Etherscan API key is not configured. Set ETHERSCAN_API_KEY to query on-chain data."
    );
  }
  return key;
}

export class EtherscanProvider implements BlockchainDataProvider {
  id = "etherscan";
  name = "Etherscan";
  capability: ProviderCapability = "blockchain";
  supportedNetworks = ["ethereum", "polygon", "arbitrum", "optimism", "base"];
  requiredEnvVars = ["ETHERSCAN_API_KEY"];

  private apiKey?: string;
  private baseUrl = "https://api.etherscan.io/v2/api";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getSecret("ETHERSCAN_API_KEY");
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(
        `${this.baseUrl}?chainid=1&module=proxy&action=eth_blockNumber&apikey=${this.apiKey}`
      );
      const json = (await res.json()) as { result?: string };
      return typeof json.result === "string";
    } catch {
      return false;
    }
  }

  async getWalletBalance(address: string, network = "ethereum"): Promise<ProviderResult<WalletBalance>> {
    // DATA INTEGRITY: never return invented balances. A missing key surfaces as
    // an explicit error so the agent reports "data unavailable" instead of
    // presenting fabricated holdings as fact.
    const apiKey = requireKey(this.apiKey);

    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "balance", { address, network });
    const cached = await cache.get<WalletBalance>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: { provider: this.id, network, fetchedAt: new Date().toISOString() },
      };
    }

    const url = `${this.baseUrl}?chainid=${getChainId(network)}&module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Etherscan balance query failed with status ${res.status}`);
    }

    const raw = await res.json();
    const parsed = EtherscanBalanceSchema.safeParse(raw);
    if (!parsed.success || parsed.data.status !== "1") {
      logger.warn("Etherscan balance error", { provider: this.id, data: { raw } });
      throw new Error(`Etherscan failed: ${raw.message || "Invalid response"}`);
    }

    const wei = BigInt(parsed.data.result);
    // String-based conversion to avoid Number precision loss for large balances
    const weiStr = wei.toString().padStart(19, "0");
    const intPart = weiStr.slice(0, -18) || "0";
    const fracPart = weiStr.slice(-18).replace(/0+$/, "") || "0";
    const eth = `${intPart}.${fracPart.slice(0, 6)}`;

    const data: WalletBalance = {
      address,
      network,
      nativeBalance: eth,
      nativeSymbol: "ETH",
      tokens: [],
    };

    WalletBalanceSchema.parse(data);
    await cache.set(cacheKey, data, 60);

    return {
      data,
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
    page?: Pagination
  ): Promise<ProviderResult<Transaction[]>> {
    const apiKey = requireKey(this.apiKey);

    const offset = page?.limit || 15;
    const pageNum = page?.page || 1;
    const url = `${this.baseUrl}?chainid=${getChainId(network)}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=${pageNum}&offset=${offset}&sort=desc&apikey=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Etherscan txlist failed with status ${res.status}`);
    }

    const raw = await res.json();
    const parsed = EtherscanTxListSchema.safeParse(raw);
    if (!parsed.success || !Array.isArray(parsed.data.result)) {
      return {
        data: [],
        source: { provider: this.id, network, fetchedAt: new Date().toISOString() },
      };
    }

    const txs: Transaction[] = parsed.data.result.map((item) => {
      const valEth = (Number(BigInt(item.value)) / 1e18).toFixed(6);
      return {
        hash: item.hash,
        blockNumber: Number(item.blockNumber),
        timestamp: new Date(Number(item.timeStamp) * 1000).toISOString(),
        from: item.from,
        to: item.to,
        value: `${valEth} ETH`,
        status: item.isError === "0" ? "success" : "failed",
        network,
      };
    });

    return {
      data: txs,
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
    const apiKey = requireKey(this.apiKey);

    const url = `${this.baseUrl}?chainid=${getChainId(network)}&module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Etherscan getTx failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      result?: {
        hash: string;
        from: string;
        to: string;
        value: string;
        blockNumber: string;
        gas: string;
        gasPrice: string;
        input: string;
      };
    };

    if (!json.result) {
      throw new Error(`Transaction ${txHash} not found on Etherscan.`);
    }

    const tx = json.result;
    const detail: TransactionDetail = {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: `${(Number(BigInt(tx.value || "0")) / 1e18).toFixed(6)} ETH`,
      blockNumber: Number(BigInt(tx.blockNumber || "0")),
      timestamp: new Date().toISOString(),
      status: "success",
      network,
      gasPrice: tx.gasPrice,
      gasUsed: tx.gas,
      inputData: tx.input,
    };

    TransactionDetailSchema.parse(detail);

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
    const apiKey = requireKey(this.apiKey);

    const url = `${this.baseUrl}?chainid=${getChainId(network)}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Etherscan contract source failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      result?: {
        ContractName?: string;
        CompilerVersion?: string;
        ABI?: string;
      }[];
    };

    const item = json.result?.[0];
    const isVerified = Boolean(item && item.ABI && item.ABI !== "Contract source code not verified");

    const info: ContractInfo = {
      address,
      network,
      name: item?.ContractName || "Unknown Contract",
      verified: isVerified,
      compilerVersion: item?.CompilerVersion,
      abiSummary: isVerified ? "Verified ABI available" : "Unverified / No Source",
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

  // NOTE: Etherscan's public API does not expose a first-class token holder
  // distribution endpoint for all chains. We implement `getTokenHolders` using
  // the `tokenholderlist` module where supported and throw a clear "not
  // available" error otherwise — never a made-up holder table.
  async getTokenHolders(
    address: string,
    network = "ethereum"
  ): Promise<ProviderResult<HolderInfo[]>> {
    const apiKey = requireKey(this.apiKey);

    const url = `${this.baseUrl}?chainid=${getChainId(network)}&module=token&action=tokenholderlist&contractaddress=${address}&page=1&offset=20&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Etherscan token holder list failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      status?: string;
      result?: { TokenHolderAddress?: string; TokenHolderQuantity?: string }[] | string;
    };

    if (!Array.isArray(json.result)) {
      throw new Error(`Etherscan returned no token holder data for ${address}.`);
    }

    const rawHolders = json.result;
    const totalSupply = rawHolders.reduce(
      (acc, h) => acc + Number(BigInt(h.TokenHolderQuantity || "0")),
      0
    );

    const holders: HolderInfo[] = rawHolders.map((h) => {
      const balance = BigInt(h.TokenHolderQuantity || "0").toString();
      return {
        address: h.TokenHolderAddress || "unknown",
        balance,
        percentage:
          totalSupply > 0 ? Number(((Number(balance) / totalSupply) * 100).toFixed(2)) : undefined,
      };
    });

    return {
      data: holders,
      source: {
        provider: this.id,
        network,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
