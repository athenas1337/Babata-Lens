import { z } from "zod";

/**
 * A secret copied into a dashboard often keeps its surrounding quotes
 * (`COINGECKO_API_KEY="CG-abc123"`), and a trailing quote is sent as part of the
 * header, which the provider rejects with 401. Strip quoting/whitespace for every
 * environment string before validation.
 */
export function normalizeEnvValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
  return unquoted === "" ? undefined : unquoted;
}

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(normalizeEnvValue, schema);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.string().default("3000"),

  // Database & Cache
  DATABASE_URL: emptyToUndefined(z.string().optional()),
  UPSTASH_REDIS_REST_URL: emptyToUndefined(z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: emptyToUndefined(z.string().optional()),

  // Security
  // No hardcoded default: generateSessionToken/authorize derive the session
  // cookie from this value, so a public default would be forgeable by anyone.
  // Set AUTH_SECRET in the deployment (openssl rand -hex 32).
  AUTH_SECRET: emptyToUndefined(z.string().min(32).optional()),
  ADMIN_ACCESS_TOKEN: emptyToUndefined(z.string().optional()),
  /** Explicit opt-in for unauthenticated local development. Never enable in production. */
  DEV_ALLOW_ANONYMOUS: emptyToUndefined(z.enum(["true", "false"]).default("false")),
  
  // AI Providers (Optional - checked on provider initialization)
  ANTHROPIC_API_KEY: emptyToUndefined(z.string().optional()),
  OPENROUTER_API_KEY: emptyToUndefined(z.string().optional()),
  GOOGLE_AI_API_KEY: emptyToUndefined(z.string().optional()),
  
  // Market Data Providers
  COINGECKO_API_KEY: emptyToUndefined(z.string().optional()),
  COINMARKETCAP_API_KEY: emptyToUndefined(z.string().optional()),
  
  // Blockchain Providers
  ETHERSCAN_API_KEY: emptyToUndefined(z.string().optional()),
  ALCHEMY_API_KEY: emptyToUndefined(z.string().optional()),
  SOLSCAN_API_KEY: emptyToUndefined(z.string().optional()),
  
  // Analytics
  DUNE_API_KEY: emptyToUndefined(z.string().optional()),

  // Smart-money wallet labelling (optional, paid plan)
  NANSEN_API_KEY: emptyToUndefined(z.string().optional()),
  /** Free-tier Web3 data API (deep-index.moralis.io) used for token holder data. */
  MORALIS_API_KEY: emptyToUndefined(z.string().optional()),
  
  // Exchange Providers
  BINGX_API_KEY: emptyToUndefined(z.string().optional()),
  BINGX_API_SECRET: emptyToUndefined(z.string().optional()),
  BINANCE_API_KEY: emptyToUndefined(z.string().optional()),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

let parsedEnv: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!parsedEnv) {
    const result = EnvSchema.safeParse(process.env);
    if (!result.success) {
      const issues = result.error.format();
      console.error("Environment validation failed:", issues);
      throw new Error(`Invalid environment configuration: ${JSON.stringify(issues)}`);
    }
    parsedEnv = result.data;
  }
  return parsedEnv;
}

/**
 * Read a provider secret with quoting/whitespace stripped. Providers use this
 * instead of raw process.env so a quoted dashboard value still authenticates.
 */
export function getSecret(envVar: string): string | undefined {
  const value = process.env[envVar];
  if (!value) return undefined;
  const cleaned = value.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
  return cleaned || undefined;
}

export function validateProviderEnv(providerId: string, requiredVars: string[]): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const varName of requiredVars) {
    const val = process.env[varName];
    if (normalizeEnvValue(val) === undefined) {
      missing.push(varName);
    }
  }
  return {
    valid: missing.length === 0,
    missing,
  };
}
