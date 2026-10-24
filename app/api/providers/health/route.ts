import { NextRequest, NextResponse } from "next/server";
import { initializeProviderRegistry } from "@/lib/providers";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";
import { getDatabaseMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Authentication check
  const auth = await authenticateRequest(req);
  if (!auth) {
    return unauthorizedResponse();
  }

  const registry = initializeProviderRegistry();
  const manifests = registry.listManifests();

  const results = await Promise.all(
    manifests.map(async (m) => {
      const provider = registry.getProvider(m.id);
      const configured = registry.isProviderConfigured(m.id);
      // Only probe providers that actually have a usable key (or need none).
      // Probing unconfigured upstreams burns quota and always reports false.
      let healthy = false;
      let latencyMs: number | undefined;
      if (provider && configured) {
        const start = Date.now();
        try {
          healthy = await provider.healthCheck();
        } catch {
          healthy = false;
        }
        latencyMs = Date.now() - start;
      }

      const active = registry.isProviderActive(m.id);

      return {
        id: m.id,
        name: m.name,
        capability: m.capability,
        requiredEnvVars: m.requiredEnvVars,
        configured,
        healthy,
        latencyMs,
        degraded: registry.isDegraded(m.id),
        /** The registry will route to this provider right now. */
        active,
        /**
         * The routable provider the registry actually picks for this capability.
         * Checking only "active" would label a keyless provider PRIMARY even
         * when the router skips it in favour of a configured one.
         */
        primary: active && registry.getPrimaryProvider(m.capability)?.id === m.id,
      };
    })
  );

  // Only providers that the registry will actually route to count toward the
  // verdict: optional key-gated providers left blank are "not configured", not
  // an outage, and the offline local engine never needs to reach the network.
  const routableProviders = results.filter((p) => p.active && p.capability !== "ai");
  const allHealthy =
    routableProviders.length === 0 || routableProviders.every((p) => p.healthy);

  return NextResponse.json({
    status: allHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    persistence: getDatabaseMode(),
    providers: results,
  });
}