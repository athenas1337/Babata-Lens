import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import {
  User,
  Conversation,
  Message,
  ToolCallLog,
  ProviderConfig,
  ProviderHealth,
  HealthStatus,
} from "./schema";
import { IDatabase } from "./index";
import { logger } from "../observability/logger";

/**
 * Neon (serverless Postgres) backed persistence layer.
 *
 * On Vercel each request may hit a cold serverless instance, so an in-memory
 * database loses all conversation state between invocations. This adapter
 * persists to Neon when DATABASE_URL is present and auto-creates the minimal
 * schema on first use.
 */
export class NeonDatabase implements IDatabase {
  private sql: NeonQueryFunction<false, false>;
  private schemaReady: Promise<void> | null = null;

  constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  /** Lazily create tables once per process. */
  private ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.bootstrapSchema().catch((err) => {
        // Reset so a later request can retry (e.g. transient network issue).
        this.schemaReady = null;
        throw err;
      });
    }
    return this.schemaReady;
  }

  private async bootstrapSchema(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'operator',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sources JSONB,
        model TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages (conversation_id, created_at)
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS tool_call_logs (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        conversation_id TEXT,
        tool_name TEXT NOT NULL,
        provider TEXT NOT NULL,
        params_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        error_code TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        capability TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        priority INTEGER NOT NULL DEFAULT 0,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS provider_health (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        capability TEXT NOT NULL,
        status TEXT NOT NULL,
        last_success_at TIMESTAMPTZ,
        latency_ms INTEGER,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    logger.info("Neon schema bootstrap complete");
  }

  // ── Users ────────────────────────────────────────────────────────────
  async getUserById(id: string): Promise<User | null> {
    await this.ensureSchema();
    const rows = await this.sql`
      SELECT id, username, email, role, created_at FROM users WHERE id = ${id} LIMIT 1
    `;
    const row = rows[0];
    return row ? mapUser(row) : null;
  }

  async getOrCreateDefaultOperator(): Promise<User> {
    await this.ensureSchema();
    const existing = await this.getUserById("operator-01");
    if (existing) return existing;

    await this.sql`
      INSERT INTO users (id, username, email, role)
      VALUES (${"operator-01"}, ${"babata_operator"}, ${"operator@babata.lens"}, ${"admin"})
      ON CONFLICT (id) DO NOTHING
    `;
    const created = await this.getUserById("operator-01");
    return created!;
  }

  // ── Conversations ────────────────────────────────────────────────────
  async createConversation(userId: string, title: string): Promise<Conversation> {
    await this.ensureSchema();
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const rows = await this.sql`
      INSERT INTO conversations (id, user_id, title)
      VALUES (${id}, ${userId}, ${title})
      RETURNING id, user_id, title, created_at, updated_at
    `;
    return mapConversation(rows[0]);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    await this.ensureSchema();
    const rows = await this.sql`
      SELECT id, user_id, title, created_at, updated_at
      FROM conversations WHERE id = ${id} LIMIT 1
    `;
    return rows[0] ? mapConversation(rows[0]) : null;
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    await this.ensureSchema();
    const rows = await this.sql`
      SELECT id, user_id, title, created_at, updated_at
      FROM conversations WHERE user_id = ${userId}
      ORDER BY updated_at DESC
      LIMIT 100
    `;
    return rows.map(mapConversation);
  }

  async deleteConversation(id: string): Promise<void> {
    await this.ensureSchema();
    await this.sql`DELETE FROM messages WHERE conversation_id = ${id}`;
    await this.sql`DELETE FROM conversations WHERE id = ${id}`;
  }

  // ── Messages ─────────────────────────────────────────────────────────
  async addMessage(msg: Omit<Message, "id" | "createdAt">): Promise<Message> {
    await this.ensureSchema();
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const rows = await this.sql`
      INSERT INTO messages (id, conversation_id, role, content, sources, model)
      VALUES (
        ${id},
        ${msg.conversationId},
        ${msg.role},
        ${msg.content},
        ${msg.sources ? JSON.stringify(msg.sources) : null},
        ${msg.model ?? null}
      )
      RETURNING id, conversation_id, role, content, sources, model, created_at
    `;

    await this.sql`
      UPDATE conversations SET updated_at = NOW() WHERE id = ${msg.conversationId}
    `;

    return mapMessage(rows[0]);
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    await this.ensureSchema();
    const rows = await this.sql`
      SELECT id, conversation_id, role, content, sources, model, created_at
      FROM messages WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
      LIMIT 500
    `;
    return rows.map(mapMessage);
  }

  // ── Tool Call Logs ───────────────────────────────────────────────────
  async logToolCall(log: Omit<ToolCallLog, "id" | "createdAt">): Promise<void> {
    await this.ensureSchema();
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.sql`
      INSERT INTO tool_call_logs
        (id, request_id, conversation_id, tool_name, provider, params_redacted, duration_ms, status, error_code)
      VALUES (
        ${id},
        ${log.requestId},
        ${log.conversationId ?? null},
        ${log.toolName},
        ${log.provider},
        ${JSON.stringify(log.paramsRedacted ?? {})},
        ${Math.round(log.durationMs ?? 0)},
        ${log.status},
        ${log.errorCode ?? null}
      )
    `;
  }

  async getToolCallLogs(limit = 100): Promise<ToolCallLog[]> {
    await this.ensureSchema();
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const rows = await this.sql`
      SELECT id, request_id, conversation_id, tool_name, provider, params_redacted,
             duration_ms, status, error_code, created_at
      FROM tool_call_logs
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `;
    return rows.map(mapToolCallLog);
  }

  // ── Provider Configs ─────────────────────────────────────────────────
  async getProviderConfigs(): Promise<ProviderConfig[]> {
    await this.ensureSchema();
    const rows = await this.sql`
      SELECT id, provider_id, capability, enabled, priority, settings, updated_at
      FROM provider_configs ORDER BY priority DESC
    `;
    return rows.map(mapProviderConfig);
  }

  async upsertProviderConfig(
    config: Omit<ProviderConfig, "id" | "updatedAt">
  ): Promise<void> {
    await this.ensureSchema();
    const key = `${config.providerId}:${config.capability}`;
    await this.sql`
      INSERT INTO provider_configs (id, provider_id, capability, enabled, priority, settings)
      VALUES (
        ${key},
        ${config.providerId},
        ${config.capability},
        ${config.enabled},
        ${config.priority},
        ${JSON.stringify(config.settings ?? {})}
      )
      ON CONFLICT (id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        priority = EXCLUDED.priority,
        settings = EXCLUDED.settings,
        updated_at = NOW()
    `;
  }

  // ── Provider Health ──────────────────────────────────────────────────
  async getProviderHealth(): Promise<ProviderHealth[]> {
    await this.ensureSchema();
    const rows = await this.sql`
      SELECT id, provider_id, capability, status, last_success_at, latency_ms, updated_at
      FROM provider_health
    `;
    return rows.map(mapProviderHealth);
  }

  async updateProviderHealth(
    providerId: string,
    capability: string,
    status: HealthStatus,
    latencyMs?: number
  ): Promise<void> {
    await this.ensureSchema();
    const key = `${providerId}:${capability}`;
    await this.sql`
      INSERT INTO provider_health (id, provider_id, capability, status, last_success_at, latency_ms)
      VALUES (
        ${key},
        ${providerId},
        ${capability},
        ${status},
        ${status === "connected" ? new Date().toISOString() : null},
        ${latencyMs ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        last_success_at = COALESCE(EXCLUDED.last_success_at, provider_health.last_success_at),
        latency_ms = COALESCE(EXCLUDED.latency_ms, provider_health.latency_ms),
        updated_at = NOW()
    `;
  }
}

// ── Row mappers ────────────────────────────────────────────────────────
type Row = Record<string, unknown>;

function toIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapUser(row: Row): User {
  return {
    id: String(row.id),
    username: String(row.username),
    email: row.email ? String(row.email) : undefined,
    role: (row.role as User["role"]) ?? "operator",
    createdAt: toIso(row.created_at),
  };
}

function mapConversation(row: Row): Conversation {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapMessage(row: Row): Message {
  let sources: Message["sources"];
  if (row.sources) {
    try {
      sources =
        typeof row.sources === "string"
          ? JSON.parse(row.sources)
          : (row.sources as Message["sources"]);
    } catch {
      sources = undefined;
    }
  }
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: (row.role as Message["role"]) ?? "assistant",
    content: String(row.content),
    sources,
    model: row.model ? String(row.model) : undefined,
    createdAt: toIso(row.created_at),
  };
}

function mapToolCallLog(row: Row): ToolCallLog {
  let paramsRedacted: Record<string, unknown> = {};
  if (row.params_redacted) {
    try {
      paramsRedacted =
        typeof row.params_redacted === "string"
          ? JSON.parse(row.params_redacted)
          : (row.params_redacted as Record<string, unknown>);
    } catch {
      paramsRedacted = {};
    }
  }
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    conversationId: row.conversation_id ? String(row.conversation_id) : undefined,
    toolName: String(row.tool_name),
    provider: String(row.provider),
    paramsRedacted,
    durationMs: Number(row.duration_ms ?? 0),
    status: (row.status as ToolCallLog["status"]) ?? "success",
    errorCode: row.error_code ? String(row.error_code) : undefined,
    createdAt: toIso(row.created_at),
  };
}

function mapProviderConfig(row: Row): ProviderConfig {
  let settings: Record<string, unknown> = {};
  if (row.settings) {
    try {
      settings =
        typeof row.settings === "string"
          ? JSON.parse(row.settings)
          : (row.settings as Record<string, unknown>);
    } catch {
      settings = {};
    }
  }
  return {
    id: String(row.id),
    providerId: String(row.provider_id),
    capability: String(row.capability),
    enabled: Boolean(row.enabled),
    priority: Number(row.priority ?? 0),
    settings,
    updatedAt: toIso(row.updated_at),
  };
}

function mapProviderHealth(row: Row): ProviderHealth {
  return {
    id: String(row.id),
    providerId: String(row.provider_id),
    capability: String(row.capability),
    status: (row.status as HealthStatus) ?? "unavailable",
    lastSuccessAt: row.last_success_at ? toIso(row.last_success_at) : undefined,
    latencyMs: row.latency_ms != null ? Number(row.latency_ms) : undefined,
    updatedAt: toIso(row.updated_at),
  };
}
