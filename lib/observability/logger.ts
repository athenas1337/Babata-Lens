export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  requestId?: string;
  provider?: string;
  capability?: string;
  operation?: string;
  latencyMs?: number;
  statusCode?: number;
  errorCode?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /auth/i,
  /bearer/i,
  /password/i,
  /credential/i,
  /private/i,
];

export function redactSensitiveData(obj: unknown): unknown {
  if (typeof obj === "string") {
    if (/bearer\s+[a-zA-Z0-9._-]+/i.test(obj)) {
      return obj.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]");
    }
    if (obj.length > 20 && /^[a-zA-Z0-9_-]{20,}$/.test(obj)) {
      return "[REDACTED_SECRET]";
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item));
  }

  if (obj !== null && typeof obj === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }

  return obj;
}

export class Logger {
  private format(entry: LogEntry): string {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      requestId: entry.requestId,
      provider: entry.provider,
      capability: entry.capability,
      operation: entry.operation,
      latencyMs: entry.latencyMs,
      statusCode: entry.statusCode,
      errorCode: entry.errorCode,
      data: redactSensitiveData(entry.data),
    });
  }

  info(message: string, meta?: Partial<LogEntry>): void {
    const entry: LogEntry = {
      level: "info",
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };
    console.log(this.format(entry));
  }

  warn(message: string, meta?: Partial<LogEntry>): void {
    const entry: LogEntry = {
      level: "warn",
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };
    console.warn(this.format(entry));
  }

  error(message: string, meta?: Partial<LogEntry>): void {
    const entry: LogEntry = {
      level: "error",
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };
    console.error(this.format(entry));
  }

  debug(message: string, meta?: Partial<LogEntry>): void {
    if (process.env.NODE_ENV !== "production") {
      const entry: LogEntry = {
        level: "debug",
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      };
      console.debug(this.format(entry));
    }
  }
}

export const logger = new Logger();
