import { initializeProviderRegistry } from "../providers";
import { AIProvider, AgentMessage } from "../providers/interfaces";
import { BABATA_SYSTEM_PROMPT } from "./prompts";
import { BABATA_TOOLS } from "../tools/definitions";
import { executeTool, ToolExecutionResult } from "../tools/executor";
import { getDatabase } from "../db";
import { logger } from "../observability/logger";

export type BabataAvatarState =
  | "idle"
  | "thinking"
  | "analyzing"
  | "streaming"
  | "success"
  | "warning"
  | "error"
  | "offline";

export interface AgentEventCallback {
  onAvatarState?: (state: BabataAvatarState) => void;
  onToolCallStart?: (tool: string, input: Record<string, unknown>) => void;
  onToolCallEnd?: (tool: string, durationMs: number, success: boolean, error?: string) => void;
  onToken?: (token: string) => void;
  onDataSource?: (provider: string, timestamp: string) => void;
  onError?: (code: string, message: string, fallbackUsed: boolean) => void;
  onDone?: (conversationId: string, messageId: string) => void;
}

export interface OrchestratorOptions {
  conversationId?: string;
  userId?: string;
  maxToolIterations?: number;
  callbacks?: AgentEventCallback;
}

export class BabataAgentOrchestrator {
  private db = getDatabase();
  private maxToolIterations = 5;

  async processUserPrompt(
    userMessage: string,
    options?: OrchestratorOptions
  ): Promise<{
    conversationId: string;
    messageId: string;
    finalText: string;
    toolCalls: ToolExecutionResult[];
    sources: { provider: string; timestamp: string }[];
  }> {
    return this.processMessage(userMessage, options);
  }

  async processMessage(
    userMessage: string,
    options?: OrchestratorOptions
  ): Promise<{
    conversationId: string;
    messageId: string;
    finalText: string;
    toolCalls: ToolExecutionResult[];
    sources: { provider: string; timestamp: string }[];
  }> {
    const registry = initializeProviderRegistry();
    const callbacks = options?.callbacks;
    const maxIterations = options?.maxToolIterations || this.maxToolIterations;

    // 1. Resolve or create conversation
    let conversationId = options?.conversationId;
    const userId = options?.userId || "anonymous";

    if (!conversationId) {
      const conv = await this.db.createConversation(
        userId,
        userMessage.slice(0, 40)
      );
      conversationId = conv.id;
    }

    // Save user message
    await this.db.addMessage({
      conversationId,
      role: "user",
      content: userMessage,
    });

    callbacks?.onAvatarState?.("thinking");

    // 2. Fetch existing history for context
    const existingMessages = await this.db.getMessages(conversationId);
    const aiMessages: AgentMessage[] = [
      { role: "system", content: BABATA_SYSTEM_PROMPT },
      ...existingMessages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ];

    const executedTools: ToolExecutionResult[] = [];
    const sources: { provider: string; timestamp: string }[] = [];
    let finalText = "";
    let iteration = 0;

    // 3. Resolve AI provider with fallback
    let resolved = await registry.resolveProvider<AIProvider>("ai");
    if (!resolved) {
      callbacks?.onAvatarState?.("offline");
      callbacks?.onError?.("NO_AI_PROVIDER", "No AI provider configured. Falling back to local engine.", true);
      resolved = registry.getProvider<AIProvider>("local-babata");
    }

    if (!resolved) {
      throw new Error("Unable to initialize any intelligence engine.");
    }
    let aiProvider: AIProvider = resolved;

    // 4. Agent tool execution loop
    while (iteration < maxIterations) {
      iteration++;

      let response;
      let success = false;

      while (!success) {
        try {
          response = await aiProvider.generateResponse({
            messages: aiMessages,
            tools: BABATA_TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: "shape" in t.parameters ? (t.parameters as any).shape : (t.parameters as any)._def?.schema?.shape || {},
            })),
          });
          success = true;
        } catch (providerError) {
          logger.warn(`AI Provider ${aiProvider.name} failed. Attempting fallback...`, {
            provider: aiProvider.id,
            data: { error: providerError instanceof Error ? providerError.message : String(providerError) },
          });

          registry.recordFailure(aiProvider.id);
          callbacks?.onError?.(
            "PROVIDER_ERROR",
            `Switched from ${aiProvider.name} to backup intelligence provider due to upstream latency/error.`,
            true
          );

          // Find next available active AI provider that is not degraded
          const currentId: string = aiProvider.id;
          const candidateProviders = registry.getProvidersByCapability<AIProvider>("ai");
          const nextProvider: AIProvider | null =
            candidateProviders.find((p) => p.id !== currentId && !registry.isDegraded(p.id)) ||
            registry.getProvider<AIProvider>("local-babata");

          if (!nextProvider || nextProvider.id === currentId) {
            throw providerError;
          }
          aiProvider = nextProvider;
        }
      }

      if (!response) {
        throw new Error("Unable to retrieve response from any intelligence provider.");
      }

      // Check if model emitted tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        callbacks?.onAvatarState?.("analyzing");

        for (const call of response.toolCalls) {
          callbacks?.onToolCallStart?.(call.toolName, call.parameters);

          const toolRes = await executeTool(call.toolName, call.parameters);
          executedTools.push(toolRes);

          // Log tool execution in database
          await this.db.logToolCall({
            requestId: `req_${Date.now()}`,
            conversationId,
            toolName: call.toolName,
            provider: toolRes.source?.provider || aiProvider.id,
            paramsRedacted: call.parameters,
            durationMs: toolRes.durationMs,
            status: toolRes.success ? "success" : "error",
            errorCode: toolRes.error,
          });

          callbacks?.onToolCallEnd?.(call.toolName, toolRes.durationMs, toolRes.success, toolRes.error);

          if (toolRes.source) {
            sources.push(toolRes.source);
            callbacks?.onDataSource?.(toolRes.source.provider, toolRes.source.timestamp);
          }

          // Feed tool response back into dialogue
          aiMessages.push({
            role: "assistant",
            content: `Invoking tool ${call.toolName}...`,
            toolCalls: [call],
          });
          aiMessages.push({
            role: "tool",
            name: call.toolName,
            content: toolRes.formattedOutput,
          });
        }
        continue;
      }

      // No more tool calls: final text reached
      finalText = response.text;
      break;
    }

    callbacks?.onAvatarState?.("streaming");
    callbacks?.onToken?.(finalText);

    // Save assistant message to database
    const savedMsg = await this.db.addMessage({
      conversationId,
      role: "assistant",
      content: finalText,
      model: aiProvider.id,
      sources: sources.map((s) => ({
        provider: s.provider,
        fetchedAt: s.timestamp,
      })),
    });

    callbacks?.onAvatarState?.(executedTools.some((t) => !t.success) ? "warning" : "success");
    callbacks?.onDone?.(conversationId, savedMsg.id);

    return {
      conversationId,
      messageId: savedMsg.id,
      finalText,
      toolCalls: executedTools,
      sources,
    };
  }
}
