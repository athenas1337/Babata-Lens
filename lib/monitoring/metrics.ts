/**
 * Performance monitoring utilities for Babata Lens
 * Tracks API latency, error rates, and system health metrics
 */

import { logger } from "../observability/logger";

export interface MetricRecord {
  timestamp: string;
  metric: string;
  value: number;
  tags?: Record<string, string>;
}

interface LatencyMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}

class MetricsCollector {
  private latencies: Map<string, LatencyMetrics> = new Map();
  private errorRates: Map<string, { errors: number; total: number }> = new Map();
  private cacheHits: Map<string, { hits: number; misses: number }> = new Map();

  /** Record API call completion */
  recordApiCall(
    providerId: string,
    success: boolean,
    latencyMs: number,
    tags?: Record<string, string>
  ): void {
    const existing = this.latencies.get(providerId) || {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatencyMs: 0,
      minLatencyMs: Infinity,
      maxLatencyMs: 0,
    };

    existing.totalRequests += 1;
    if (success) {
      existing.successfulRequests += 1;
    } else {
      existing.failedRequests += 1;
    }
    existing.totalLatencyMs += latencyMs;
    existing.minLatencyMs = Math.min(existing.minLatencyMs, latencyMs);
    existing.maxLatencyMs = Math.max(existing.maxLatencyMs, latencyMs);

    this.latencies.set(providerId, existing);

    // Log summary every 100 requests
    if (existing.totalRequests % 100 === 0) {
      const avgLatency = existing.totalLatencyMs / existing.totalRequests;
      const successRate = (existing.successfulRequests / existing.totalRequests) * 100;
      logger.info("Provider performance summary", {
        provider: providerId,
        data: {
          totalRequests: existing.totalRequests,
          successRate: `${successRate.toFixed(2)}%`,
          avgLatencyMs: `${avgLatency.toFixed(2)}ms`,
          ...tags,
        },
      });
    }
  }

  /** Record error occurrence */
  recordError(providerId: string): void {
    const existing = this.errorRates.get(providerId) || { errors: 0, total: 0 };
    existing.errors += 1;
    existing.total += 1;
    this.errorRates.set(providerId, existing);

    // Alert if error rate exceeds 10%
    const errorRate = (existing.errors / existing.total) * 100;
    if (errorRate > 10 && existing.total >= 10) {
      logger.warn("High error rate detected", {
        provider: providerId,
        data: {
          errorRate: `${errorRate.toFixed(2)}%`,
          totalRequests: existing.total,
          errorCount: existing.errors,
        },
      });
    }
  }

  /** Track cache performance */
  recordCacheHit(cacheKey: string): void {
    const existing = this.cacheHits.get(cacheKey) || { hits: 0, misses: 0 };
    existing.hits += 1;
    this.cacheHits.set(cacheKey, existing);
  }

  /** Record cache miss */
  recordCacheMiss(cacheKey: string): void {
    const existing = this.cacheHits.get(cacheKey) || { hits: 0, misses: 0 };
    existing.misses += 1;
    this.cacheHits.set(cacheKey, existing);
  }

  /** Get overall metrics snapshot */
  getMetricsSnapshot(): {
    providers: Array<{
      id: string;
      successRate: number;
      avgLatencyMs: number;
      totalRequests: number;
    }>;
    cachePerformance: Array<{
      key: string;
      hitRatio: number;
      totalReads: number;
    }>;
    overallHealth: string;
  } {
    const providers = Array.from(this.latencies.entries()).map(([id, m]) => ({
      id,
      successRate: (m.successfulRequests / m.totalRequests) * 100,
      avgLatencyMs: m.totalLatencyMs / m.totalRequests,
      totalRequests: m.totalRequests,
    })).sort((a, b) => b.totalRequests - a.totalRequests);

    const cachePerformance = Array.from(this.cacheHits.entries()).map(([key, m]) => {
      const total = m.hits + m.misses;
      return {
        key,
        hitRatio: (m.hits / total) * 100,
        totalReads: total,
      };
    }).sort((a, b) => b.totalReads - a.totalReads);

    // Calculate overall health score (0-100)
    let totalScore = 0;
    let providerCount = 0;

    for (const [, m] of this.latencies.entries()) {
      const successRate = (m.successfulRequests / m.totalRequests) * 100;
      totalScore += successRate;
      providerCount++;
    }

    const avgSuccessRate = providerCount > 0 ? totalScore / providerCount : 0;
    const overallHealth = avgSuccessRate > 95 ? "excellent" : avgSuccessRate > 80 ? "good" : "degraded";

    return { providers, cachePerformance, overallHealth };
  }

  /** Export metrics to external service (placeholder for Datadog/New Relic integration) */
  async exportToExternalService(metricsUrl: string): Promise<void> {
    const snapshot = this.getMetricsSnapshot();

    try {
      await fetch(metricsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          ...snapshot,
        }),
      });
    } catch (err) {
      logger.warn("Failed to export metrics", { data: { error: String(err) } });
    }
  }
}

// Singleton instance
let collectorInstance: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!collectorInstance) {
    collectorInstance = new MetricsCollector();
  }
  return collectorInstance;
}
