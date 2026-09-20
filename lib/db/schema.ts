export interface User {
  id: string;
  username: string;
  email?: string;
  role: "admin" | "operator" | "viewer";
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageSourceMeta {
  provider: string;
  fetchedAt: string;
  network?: string;
  requestId?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: MessageSourceMeta[];
  model?: string;
  createdAt: string;
}

export interface ToolCallLog {
  id: string;
  requestId: string;
  conversationId?: string;
  toolName: string;
  provider: string;
  paramsRedacted: Record<string, unknown>;
  durationMs: number;
  status: "success" | "error";
  errorCode?: string;
  createdAt: string;
}

export interface ProviderConfig {
  id: string;
  providerId: string;
  capability: string;
  enabled: boolean;
  priority: number;
  settings: Record<string, unknown>; // non-secret configuration only
  updatedAt: string;
}

export type HealthStatus =
  | "configured"
  | "connected"
  | "degraded"
  | "rate_limited"
  | "invalid"
  | "unavailable"
  | "disabled";

export interface ProviderHealth {
  id: string;
  providerId: string;
  capability: string;
  status: HealthStatus;
  lastSuccessAt?: string;
  latencyMs?: number;
  updatedAt: string;
}
