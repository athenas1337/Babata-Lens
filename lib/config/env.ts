import { z } from "zod";

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (typeof val === "string" && val.trim() === "" ? undefined : val), schema);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),
  
  // Database & Cache
  DATABASE_URL: emptyToUndefined(z.string().optional()),
  UPSTASH_REDIS_REST_URL: emptyToUndefined(z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: emptyToUndefined(z.string().optional()),
  
  // Security
  AUTH_SECRET: emptyToUndefined(
    z.string().min(16).default("babata-dev-auth-secret-change-in-prod-32-chars")
  ),
  ADMIN_ACCESS_TOKEN: emptyToUndefined(z.string().optional()),
  
  // AI Providers (Optional - checked on provider initialization)
  ANTHROPIC_API_KEY: emptyToUndefined(z.string().optional()),
  OPENROUTER_API_KEY: emptyToUndefined(z.string().optional()),
  GOOGLE_AI_API_KEY: emptyToUndefined(z.string().optional()),
  
  // Market Providers
  COINGECKO_API_KEY: emptyToUndefined(z.string().optional()),
  COINMARKETCAP_API_KEY: emptyToUndefined(z.string().optional()),
  
  // Blockchain Providers
  ETHERSCAN_API_KEY: emptyToUndefined(z.string().optional()),
  ALCHEMY_API_KEY: emptyToUndefined(z.string().optional()),
  SOLSCAN_API_KEY: emptyToUndefined(z.string().optional()),
  
  // Analytics
  DUNE_API_KEY: emptyToUndefined(z.string().optional()),
  
  // Exchange
  BINGX_API_KEY: emptyToUndefined(z.string().optional()),
  BINGX_API_SECRET: emptyToUndefined(z.string().optional()),
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

export function validateProviderEnv(providerId: string, requiredVars: string[]): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const varName of requiredVars) {
    const val = process.env[varName];
    if (!val || val.trim() === "") {
      missing.push(varName);
    }
  }
  return {
    valid: missing.length === 0,
    missing,
  };
}
