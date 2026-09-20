import {
  User,
  Conversation,
  Message,
  ToolCallLog,
  ProviderConfig,
  ProviderHealth,
  HealthStatus,
} from "./schema";

export interface IDatabase {
  // Users
  getUserById(id: string): Promise<User | null>;
  getOrCreateDefaultOperator(): Promise<User>;

  // Conversations
  createConversation(userId: string, title: string): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(userId: string): Promise<Conversation[]>;
  deleteConversation(id: string): Promise<void>;

  // Messages
  addMessage(msg: Omit<Message, "id" | "createdAt">): Promise<Message>;
  getMessages(conversationId: string): Promise<Message[]>;

  // Tool Call Logs (no secrets stored)
  logToolCall(log: Omit<ToolCallLog, "id" | "createdAt">): Promise<void>;
  getToolCallLogs(limit?: number): Promise<ToolCallLog[]>;

  // Provider Configs
  getProviderConfigs(): Promise<ProviderConfig[]>;
  upsertProviderConfig(config: Omit<ProviderConfig, "id" | "updatedAt">): Promise<void>;

  // Provider Health
  getProviderHealth(): Promise<ProviderHealth[]>;
  updateProviderHealth(
    providerId: string,
    capability: string,
    status: HealthStatus,
    latencyMs?: number
  ): Promise<void>;
}

export class MemoryDatabase implements IDatabase {
  private users: Map<string, User> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private messages: Message[] = [];
  private toolLogs: ToolCallLog[] = [];
  private providerConfigs: Map<string, ProviderConfig> = new Map();
  private providerHealth: Map<string, ProviderHealth> = new Map();

  constructor() {
    const defaultUser: User = {
      id: "operator-01",
      username: "babata_operator",
      email: "operator@babata.lens",
      role: "admin",
      createdAt: new Date().toISOString(),
    };
    this.users.set(defaultUser.id, defaultUser);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async getOrCreateDefaultOperator(): Promise<User> {
    return this.users.get("operator-01")!;
  }

  async createConversation(userId: string, title: string): Promise<Conversation> {
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const conv: Conversation = {
      id,
      userId,
      title,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conv);
    return conv;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) || null;
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id);
    this.messages = this.messages.filter((m) => m.conversationId !== id);
  }

  async addMessage(msg: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const created: Message = {
      ...msg,
      id,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(created);

    const conv = this.conversations.get(msg.conversationId);
    if (conv) {
      conv.updatedAt = created.createdAt;
    }

    return created;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return this.messages.filter((m) => m.conversationId === conversationId);
  }

  async logToolCall(log: Omit<ToolCallLog, "id" | "createdAt">): Promise<void> {
    const entry: ToolCallLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.toolLogs.push(entry);
    if (this.toolLogs.length > 500) {
      this.toolLogs.shift();
    }
  }

  async getToolCallLogs(limit = 100): Promise<ToolCallLog[]> {
    return this.toolLogs.slice(-limit).reverse();
  }

  async getProviderConfigs(): Promise<ProviderConfig[]> {
    return Array.from(this.providerConfigs.values());
  }

  async upsertProviderConfig(config: Omit<ProviderConfig, "id" | "updatedAt">): Promise<void> {
    const key = `${config.providerId}:${config.capability}`;
    this.providerConfigs.set(key, {
      ...config,
      id: key,
      updatedAt: new Date().toISOString(),
    });
  }

  async getProviderHealth(): Promise<ProviderHealth[]> {
    return Array.from(this.providerHealth.values());
  }

  async updateProviderHealth(
    providerId: string,
    capability: string,
    status: HealthStatus,
    latencyMs?: number
  ): Promise<void> {
    const key = `${providerId}:${capability}`;
    const now = new Date().toISOString();
    const existing = this.providerHealth.get(key);

    this.providerHealth.set(key, {
      id: key,
      providerId,
      capability,
      status,
      lastSuccessAt: status === "connected" ? now : existing?.lastSuccessAt,
      latencyMs: latencyMs ?? existing?.latencyMs,
      updatedAt: now,
    });
  }
}

let dbInstance: IDatabase | null = null;

export function getDatabase(): IDatabase {
  if (!dbInstance) {
    dbInstance = new MemoryDatabase();
  }
  return dbInstance;
}
