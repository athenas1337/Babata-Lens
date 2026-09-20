import { logger } from "../observability/logger";

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  generateKey(provider: string, capability: string, params: Record<string, unknown>): string;
}

export class MemoryCacheService implements ICacheService {
  private store = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  generateKey(provider: string, capability: string, params: Record<string, unknown>): string {
    const sortedKeys = Object.keys(params).sort();
    const sortedParams: Record<string, unknown> = {};
    for (const k of sortedKeys) {
      sortedParams[k] = params[k];
    }
    const serialized = JSON.stringify(sortedParams);
    return `${provider}:${capability}:${Buffer.from(serialized).toString("base64url")}`;
  }
}

export class UpstashRedisCacheService implements ICacheService {
  constructor(
    private restUrl: string,
    private restToken: string,
    private fallback: MemoryCacheService = new MemoryCacheService()
  ) {}

  generateKey(provider: string, capability: string, params: Record<string, unknown>): string {
    return this.fallback.generateKey(provider, capability, params);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const res = await fetch(`${this.restUrl}/get/${encodeURIComponent(key)}`, {
        headers: {
          Authorization: `Bearer ${this.restToken}`,
        },
      });
      if (!res.ok) return await this.fallback.get<T>(key);
      const data = (await res.json()) as { result: string | null };
      if (!data.result) return null;
      return JSON.parse(data.result) as T;
    } catch (err) {
      logger.warn("Upstash Redis get failed, using fallback memory cache", {
        data: { error: String(err) },
      });
      return await this.fallback.get<T>(key);
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.fallback.set(key, value, ttlSeconds);
      await fetch(`${this.restUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}?EX=${ttlSeconds}`, {
        headers: {
          Authorization: `Bearer ${this.restToken}`,
        },
      });
    } catch (err) {
      logger.warn("Upstash Redis set failed, memory cache updated only", {
        data: { error: String(err) },
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.fallback.delete(key);
      await fetch(`${this.restUrl}/del/${encodeURIComponent(key)}`, {
        headers: {
          Authorization: `Bearer ${this.restToken}`,
        },
      });
    } catch {
      // ignore
    }
  }
}

let cacheInstance: ICacheService | null = null;

export function getCache(): ICacheService {
  if (!cacheInstance) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      cacheInstance = new UpstashRedisCacheService(url, token);
    } else {
      cacheInstance = new MemoryCacheService();
    }
  }
  return cacheInstance;
}
