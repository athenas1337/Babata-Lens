import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),
  
  // Database & Cache
  DATABASE_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  
  // Security
  AUTH_SECRET: z.string().min(16).default("babata-dev-auth-secret-change-in-prod-32-chars"),
  ADMIN_ACCESS_TOKEN: z.string().optional(),
  
  // AI Providers (Optional - checked on provider initialization)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  
  // Market Providers
  COINGECKO_API_KEY: z.string().optional(),
  COINMARKETCAP_API_KEY: z.string().optional(),
  
  // Blockchain Providers
  ETHERSCAN_API_KEY: z.string().optional(),
  ALCHEMY_API_KEY: z.string().optional(),
  SOLSCAN_API_KEY: z.string().optional(),
  
  // Analytics
  DUNE_API_KEY: z.string().optional(),
  
  // Exchange
  BINGX_API_KEY: z.string().optional(),
  BINGX_API_SECRET: z.string().optional(),
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
