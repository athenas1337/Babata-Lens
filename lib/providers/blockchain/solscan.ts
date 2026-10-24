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
import { getSecret } from "../../config/env";

/**
 * Solscan (v2.0) adapter for Solana.
 *
 * DATA INTEGRITY: methods that Solscan's tier does not support throw an
 * explicit "not supported" error instead of returning placeholder rows. The
 * agent then reports the gap honestly rather than presenting fake data.
 */
export class SolscanProvider implements BlockchainDataProvider {
  id = "solscan";
  name = "Solscan";
  capability: ProviderCapability = "blockchain";
  supportedNetworks = ["solana"];
  requiredEnvVars = ["SOLSCAN_API_KEY"];

  private apiKey?: string;
  private baseUrl = "https://pro-api.solscan.io/v2.0";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getSecret("SOLSCAN_API_KEY");
  }

  private headers(): Record<string, string> {
    return { token: this.apiKey as string, Accept: "application/json" };
  }

  private requireKey(): string {
    if (!this.apiKey) {
      throw new Error(
        "Solscan API key is not configured. Set SOLSCAN_API_KEY to query Solana on-chain data."
      );
    }
    return this.apiKey;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(
        `${this.baseUrl}/account/detail?address=11111111111111111111111111111111`,
        { headers: this.headers() }
      );
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getWalletBalance(address: string, network = "solana"): Promise<ProviderResult<WalletBalance>> {
    const apiKey = this.requireKey();

    const res = await fetch(`${this.baseUrl}/account/detail?address=${address}`, {
      headers: { token: apiKey, Accept: "application/json" },
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          "Solscan API returned 401 Unauthorized: Please verify or upgrade your Solscan API key level."
        );
      }
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
    const apiKey = this.requireKey();
    const limit = Math.min(Math.max(page?.limit || 10, 1), 50);

    const res = await fetch(
      `${this.baseUrl}/account/transactions?address=${address}&page=1&page_size=${limit}`,
      { headers: { token: apiKey, Accept: "application/json" } }
    );
    if (!res.ok) {
      throw new Error(`Solscan transaction query failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      data?: {
        trans_id?: string;
        signature?: string;
        block_id?: number;
        block_time?: number;
        fee?: number;
        status?: string;
        slot?: number;
      }[];
    };

    const items = Array.isArray(json.data) ? json.data : [];
    const transactions: Transaction[] = items.map((t) => {
      const ts = t.block_time ? new Date(t.block_time * 1000).toISOString() : new Date().toISOString();
      return {
        hash: t.trans_id || t.signature || "",
        blockNumber: t.block_id ?? t.slot,
        timestamp: ts,
        // Solscan's account/transactions summary does not expose counterparties.
        from: "unknown",
        to: "unknown",
        value: t.fee !== undefined ? `fee ${(t.fee / 1e9).toFixed(6)} SOL` : "0 SOL",
        status: t.status === "Fail" || t.status === "failed" ? "failed" : "success",
        network: "solana",
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
    network = "solana"
  ): Promise<ProviderResult<TransactionDetail>> {
    const apiKey = this.requireKey();

    const res = await fetch(`${this.baseUrl}/transaction/detail?tx=${txHash}`, {
      headers: { token: apiKey, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Solscan transaction lookup failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      data?: {
        block_id?: number;
        block_time?: number;
        fee?: number;
        status?: string;
        signer?: string[];
        parsed_instructions?: { parsed?: { type?: string; info?: Record<string, unknown> } }[];
      };
    };
    const tx = json.data;
    if (!tx) {
      throw new Error(`Transaction ${txHash} not found on Solscan.`);
    }

    const transfer = tx.parsed_instructions?.find((i) => i.parsed?.type === "transfer");
    const info = transfer?.parsed?.info as { source?: string; destination?: string } | undefined;

    return {
      data: {
        hash: txHash,
        blockNumber: tx.block_id,
        timestamp: tx.block_time ? new Date(tx.block_time * 1000).toISOString() : new Date().toISOString(),
        from: info?.source || tx.signer?.[0] || "unknown",
        to: info?.destination || "unknown",
        value: tx.fee !== undefined ? `fee ${(tx.fee / 1e9).toFixed(6)} SOL` : "0 SOL",
        status: tx.status === "Fail" || tx.status === "failed" ? "failed" : "success",
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
    throw new Error(
      "Solscan program metadata (source verification) is not supported by this adapter. " +
        "Use a Solana program explorer for verified program details."
    );
  }
}
