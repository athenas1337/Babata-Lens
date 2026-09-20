import {
  IBaseProvider,
  AIProvider,
  MarketDataProvider,
  BlockchainDataProvider,
  TokenDataProvider,
  AnalyticsProvider,
  ExchangeDataProvider,
  ProviderCapability,
} from "./interfaces";
import { validateProviderEnv } from "../config/env";
import { logger } from "../observability/logger";
import { getDatabase } from "../db";

export interface ProviderManifest {
  id: string;
  name: string;
  capability: ProviderCapability;
  priority: number;
  enabled: boolean;
  supportedNetworks?: string[];
  requiredEnvVars: string[];
  timeoutMs: number;
  rateLimitPerMinute: number;
}

export class ProviderRegistry {
  private providers: Map<string, IBaseProvider> = new Map();
  private manifests: Map<string, ProviderManifest> = new Map();
  private failures: Map<string, { count: number; lastFailedAt: number }> = new Map();

  registerProvider(provider: IBaseProvider, manifest: ProviderManifest): void {
    this.providers.set(provider.id, provider);
    this.manifests.set(provider.id, manifest);
  }

  recordFailure(providerId: string): void {
    const current = this.failures.get(providerId) || { count: 0, lastFailedAt: 0 };
    this.failures.set(providerId, {
      count: current.count + 1,
      lastFailedAt: Date.now(),
    });
  }

  recordSuccess(providerId: string): void {
    this.failures.delete(providerId);
  }

  isDegraded(providerId: string): boolean {
    const record = this.failures.get(providerId);
    if (!record || record.count < 3) return false;
    const cooldownMs = 60000; // 60s cooldown
    if (Date.now() - record.lastFailedAt > cooldownMs) {
      // Cooldown expired, half-open test
      return false;
    }
    return true;
  }

  isCircuitOpen(providerId: string): boolean {
    return this.isDegraded(providerId);
  }

  getProvider<T extends IBaseProvider>(id: string): T | null {
    const provider = this.providers.get(id);
    return (provider as T) || null;
  }

  getManifest(id: string): ProviderManifest | null {
    return this.manifests.get(id) || null;
  }

  listManifests(): ProviderManifest[] {
    return Array.from(this.manifests.values());
  }

  isProviderConfigured(id: string): boolean {
    const manifest = this.manifests.get(id);
    if (!manifest) return false;
    const { valid } = validateProviderEnv(id, manifest.requiredEnvVars);
    return valid;
  }

  isProviderActive(id: string): boolean {
    const manifest = this.manifests.get(id);
    if (!manifest || !manifest.enabled) return false;
    return this.isProviderConfigured(id);
  }

  getProvidersByCapability<T extends IBaseProvider>(capability: ProviderCapability): T[] {
    const matched: { provider: T; priority: number }[] = [];

    for (const [id, provider] of Array.from(this.providers.entries())) {
      const manifest = this.manifests.get(id);
      if (
        manifest &&
        manifest.capability === capability &&
        manifest.enabled &&
        this.isProviderConfigured(id) &&
        !this.isDegraded(id)
      ) {
        matched.push({ provider: provider as T, priority: manifest.priority });
      }
    }

    matched.sort((a, b) => b.priority - a.priority);
    return matched.map((m) => m.provider);
  }

  getPrimaryProvider<T extends IBaseProvider>(capability: ProviderCapability): T | null {
    const providers = this.getProvidersByCapability<T>(capability);
    return providers[0] || null;
  }

  async resolveProvider<T extends IBaseProvider>(
    capability: ProviderCapability,
    network?: string
  ): Promise<T | null> {
    const candidates = this.getProvidersByCapability<T>(capability);

    if (!network) {
      return candidates[0] || null;
    }

    // Filter by supportedNetwork if specified
    const networkCandidates = candidates.filter((p) => {
      const manifest = this.manifests.get(p.id);
      return !manifest?.supportedNetworks || manifest.supportedNetworks.includes(network.toLowerCase());
    });

    return networkCandidates[0] || candidates[0] || null;
  }

  async runHealthChecks(): Promise<
    { providerId: string; capability: ProviderCapability; status: string; latencyMs: number }[]
  > {
    const results: {
      providerId: string;
      capability: ProviderCapability;
      status: string;
      latencyMs: number;
    }[] = [];
    const db = getDatabase();

    for (const [id, provider] of this.providers.entries()) {
      const manifest = this.manifests.get(id)!;
      if (!manifest.enabled) {
        results.push({
          providerId: id,
          capability: manifest.capability,
          status: "disabled",
          latencyMs: 0,
        });
        await db.updateProviderHealth(id, manifest.capability, "disabled", 0);
        continue;
      }

      const isConfigured = this.isProviderConfigured(id);
      if (!isConfigured) {
        results.push({
          providerId: id,
          capability: manifest.capability,
          status: "unavailable",
          latencyMs: 0,
        });
        await db.updateProviderHealth(id, manifest.capability, "unavailable", 0);
        continue;
      }

      const start = Date.now();
      try {
        const ok = await Promise.race([
          provider.healthCheck(),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), manifest.timeoutMs)
          ),
        ]);
        const latencyMs = Date.now() - start;
        const status = ok ? "connected" : "degraded";

        results.push({
          providerId: id,
          capability: manifest.capability,
          status,
          latencyMs,
        });
        await db.updateProviderHealth(id, manifest.capability, status as any, latencyMs);
      } catch (err) {
        const latencyMs = Date.now() - start;
        logger.warn(`Healthcheck failed for provider: ${id}`, {
          provider: id,
          data: { error: String(err) },
        });
        results.push({
          providerId: id,
          capability: manifest.capability,
          status: "unavailable",
          latencyMs,
        });
        await db.updateProviderHealth(id, manifest.capability, "unavailable", latencyMs);
      }
    }

    return results;
  }
}

let registryInstance: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry();
  }
  return registryInstance;
}

export const registry = getProviderRegistry();
