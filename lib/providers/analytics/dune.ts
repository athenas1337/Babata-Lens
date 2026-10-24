import {
  AnalyticsProvider,
  AnalyticsQuery,
  AnalyticsResult,
  ProviderResult,
  ProviderCapability,
  AnalyticsResultSchema,
} from "../interfaces";
import { getCache } from "../../cache";
import { getSecret } from "../../config/env";

export class DuneAnalyticsProvider implements AnalyticsProvider {
  id = "dune";
  name = "Dune Analytics";
  capability: ProviderCapability = "analytics";
  requiredEnvVars: string[] = [];

  private apiKey?: string;
  private baseUrl = "https://api.dune.com/api/v1";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getSecret("DUNE_API_KEY");
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
    // DATA INTEGRITY: no synthetic rows. Without a key the caller receives an
    // explicit error so the agent can say analytics are unavailable.
    if (!this.apiKey) {
      throw new Error(
        "Dune Analytics API key is not configured. Set DUNE_API_KEY to run on-chain SQL queries."
      );
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
