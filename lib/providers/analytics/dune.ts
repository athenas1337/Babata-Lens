import {
  AnalyticsProvider,
  AnalyticsQuery,
  AnalyticsResult,
  ProviderResult,
  ProviderCapability,
  AnalyticsResultSchema,
} from "../interfaces";
import { getCache } from "../../cache";

export class DuneAnalyticsProvider implements AnalyticsProvider {
  id = "dune";
  name = "Dune Analytics";
  capability: ProviderCapability = "analytics";
  requiredEnvVars: string[] = [];

  private apiKey?: string;
  private baseUrl = "https://api.dune.com/api/v1";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DUNE_API_KEY;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return true;
    try {
      const res = await fetch(`${this.baseUrl}/query/1/results?limit=1`, {
        headers: { "x-dune-api-key": this.apiKey },
      });
      return res.status === 200 || res.status === 404;
    } catch {
      return false;
    }
  }

  async runAnalyticsQuery(query: AnalyticsQuery): Promise<ProviderResult<AnalyticsResult>> {
    if (!this.apiKey) {
      const mockResult: AnalyticsResult = {
        queryId: query.queryId,
        columns: ["day", "volume_usd", "unique_traders"],
        rows: [
          { day: "2025-05-18", volume_usd: 145000000, unique_traders: 12400 },
          { day: "2025-05-19", volume_usd: 168000000, unique_traders: 14150 },
        ],
        rowCount: 2,
        executionTimeMs: 45,
      };
      return {
        data: mockResult,
        source: {
          provider: this.id,
          fetchedAt: new Date().toISOString(),
        },
      };
    }

    const cache = getCache();
    const cacheKey = cache.generateKey(this.id, "query", { queryId: query.queryId });
    const cached = await cache.get<AnalyticsResult>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: {
          provider: this.id,
          fetchedAt: new Date().toISOString(),
        },
      };
    }

    const start = Date.now();
    const url = `${this.baseUrl}/query/${query.queryId}/results`;
    const res = await fetch(url, {
      headers: { "x-dune-api-key": this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Dune query execution failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      result?: {
        metadata?: { column_names?: string[] };
        rows?: Record<string, unknown>[];
      };
    };

    const columns = json.result?.metadata?.column_names || [];
    const rows = json.result?.rows || [];

    const result: AnalyticsResult = {
      queryId: query.queryId,
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs: Date.now() - start,
    };

    AnalyticsResultSchema.parse(result);
    await cache.set(cacheKey, result, 600); // 10 min cache for Dune

    return {
      data: result,
      source: {
        provider: this.id,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
