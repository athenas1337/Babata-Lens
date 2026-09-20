import { NextRequest, NextResponse } from "next/server";
import { initializeProviderRegistry } from "@/lib/providers";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";

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
      let healthy = false;
      if (provider) {
        try {
          healthy = await provider.healthCheck();
        } catch {
          healthy = false;
        }
      }

      return {
        id: m.id,
        name: m.name,
        capability: m.capability,
        requiredEnvVars: m.requiredEnvVars,
        healthy,
        degraded: registry.isDegraded(m.id),
        active: registry.isProviderActive(m.id),
      };
    })
  );

  const allHealthy = results.every((p) => p.healthy);

  return NextResponse.json({
    status: allHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    providers: results,
  });
}