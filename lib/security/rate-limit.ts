export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTimeMs: number;
}

class TokenBucketRateLimiter {
  private tracking: Map<string, { count: number; resetAt: number }> = new Map();

  check(key: string, options: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const record = this.tracking.get(key);

    if (!record || now > record.resetAt) {
      const resetAt = now + options.windowMs;
      this.tracking.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: options.max - 1,
        resetTimeMs: resetAt,
      };
    }

    if (record.count >= options.max) {
      return {
        allowed: false,
        remaining: 0,
        resetTimeMs: record.resetAt,
      };
    }

    record.count += 1;
    return {
      allowed: true,
      remaining: options.max - record.count,
      resetTimeMs: record.resetAt,
    };
  }

  cleanup(): void {
    const now = Date.now();
    this.tracking.forEach((record, key) => {
      if (now > record.resetAt) {
        this.tracking.delete(key);
      }
    });
  }
}

const limiter = new TokenBucketRateLimiter();

// Clean up every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => limiter.cleanup(), 5 * 60 * 1000).unref?.();
}

export function checkRateLimit(
  type: "ip" | "session" | "tool" | "provider",
  identifier: string,
  customOptions?: Partial<RateLimitOptions>
): RateLimitResult {
  const defaults: Record<string, RateLimitOptions> = {
    ip: { windowMs: 60 * 1000, max: 60 },
    session: { windowMs: 60 * 1000, max: 100 },
    tool: { windowMs: 60 * 1000, max: 30 },
    provider: { windowMs: 60 * 1000, max: 50 },
  };

  const options = {
    ...defaults[type],
    ...customOptions,
  };

  const key = `${type}:${identifier}`;
  return limiter.check(key, options);
}
