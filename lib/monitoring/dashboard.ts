/**
 * Dashboard server for real-time observability monitoring
 */

import { createServer } from "http";
import { getMetricsCollector } from "./metrics";
import { logger } from "../observability/logger";

const PORT = process.env.MONITORING_PORT ? parseInt(process.env.MONITORING_PORT) : 3001;

interface DashboardData {
  timestamp: string;
  metrics: {
    overallHealth: string;
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
  };
}

export function startDashboardServer() {
  const collector = getMetricsCollector();

  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
      return;
    }

    if (req.url === "/metrics" && req.method === "GET") {
      const snapshot = collector.getMetricsSnapshot();
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        timestamp: new Date().toISOString(),
        ...snapshot,
      }));
      return;
    }

    if (req.url === "/dashboard-data" && req.method === "GET") {
      const data: DashboardData = {
        timestamp: new Date().toISOString(),
        metrics: collector.getMetricsSnapshot(),
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(PORT, () => {
    logger.info(`Dashboard server running on port ${PORT}`);
    logger.info(`Endpoints available:`);
    logger.info(`  - GET /health - Health check`);
    logger.info(`  - GET /metrics - Raw metrics in JSON format`);
    logger.info(`  - GET /dashboard-data - Full dashboard data`);
  });

  return server;
}
