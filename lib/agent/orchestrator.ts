import { initializeProviderRegistry } from "../providers";
import { AIProvider, AgentMessage, ToolDefinitionItem } from "../providers/interfaces";
import { BABATA_SYSTEM_PROMPT } from "./prompts";
import { BABATA_TOOLS, toolParametersToJsonSchema, normalizeToolInput } from "../tools/definitions";
import { executeTool, ToolExecutionResult } from "../tools/executor";
import { sanitizePromptInput } from "../security/sanitization";
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

    // 0. Sanitize user input before it reaches any model or storage.
    const sanitizedUserMessage = sanitizePromptInput(userMessage) || userMessage.slice(0, 2000);

    // 1. Resolve or create conversation
    let conversationId = options?.conversationId;
    const userId = options?.userId || "anonymous";

    if (!conversationId) {
      const conv = await this.db.createConversation(
        userId,
        sanitizedUserMessage.slice(0, 40)
      );
      conversationId = conv.id;
    }

    // Save user message
    await this.db.addMessage({
      conversationId,
      role: "user",
      content: sanitizedUserMessage,
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

    const toolDefinitions: ToolDefinitionItem[] = BABATA_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: toolParametersToJsonSchema(t),
    }));

    // 4. Agent tool execution loop
    while (iteration < maxIterations) {
      iteration++;

      let response;
      let success = false;
      // Providers already attempted in this iteration round. Without this guard
      // the fallback chain can loop forever (A fails -> B -> A fails -> ...).
      const failedProviders = new Set<string>(aiProvider.id ? [aiProvider.id] : []);

      while (!success) {
        try {
          response = await aiProvider.generateResponse({
            messages: aiMessages,
            tools: toolDefinitions,
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

          // Find the next active AI provider that is not degraded. Exclude every
          // provider already tried in THIS turn, otherwise a single broken
          // provider plus one retry loops forever inside this while(true).
          const candidateProviders = registry.getProvidersByCapability<AIProvider>("ai");
          const nextProvider: AIProvider | null =
            candidateProviders.find((p) => !failedProviders.has(p.id)) ||
            (failedProviders.has("local-babata")
              ? null
              : registry.getProvider<AIProvider>("local-babata"));

          if (!nextProvider) {
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

        // Record the assistant's tool-call turn once (with ids) so providers
        // that require tool_call_id round-tripping stay consistent.
        aiMessages.push({
          role: "assistant",
          content: response.text || "",
          toolCalls: response.toolCalls,
        });

        for (const call of response.toolCalls) {
          const normalizedInput = normalizeToolInput(call.toolName, call.parameters || {});
          callbacks?.onToolCallStart?.(call.toolName, normalizedInput);

          const toolRes = await executeTool(call.toolName, normalizedInput);
          executedTools.push(toolRes);

          // Log tool execution in database (params already sanitized/validated).
          await this.db.logToolCall({
            requestId: `req_${Date.now()}`,
            conversationId,
            toolName: call.toolName,
            provider: toolRes.source?.provider || aiProvider.id,
            paramsRedacted: normalizedInput,
            durationMs: toolRes.durationMs,
            status: toolRes.success ? "success" : "error",
            errorCode: toolRes.error,
          });

          callbacks?.onToolCallEnd?.(call.toolName, toolRes.durationMs, toolRes.success, toolRes.error);

          if (toolRes.source) {
            sources.push(toolRes.source);
            callbacks?.onDataSource?.(toolRes.source.provider, toolRes.source.timestamp);
          }

          // Feed the tool result back into the dialogue, preserving the call id.
          aiMessages.push({
            role: "tool",
            name: call.toolName,
            toolCallId: call.id,
            content: toolRes.formattedOutput,
          });
        }
        continue;
      }

      // No more tool calls: final text reached
      finalText = response.text;
      if (!finalText.trim()) {
        finalText =
          "I was unable to produce a response for that request. Please refine the query or configure an AI provider key.";
      }
      break;
    }

    if (!finalText.trim()) {
      // Iteration budget exhausted while still calling tools — never leave blank.
      finalText =
        "I reached the maximum number of tool-analysis steps for this query. " +
        "Here is what I gathered so far; please refine the question if you need deeper analysis.";
      callbacks?.onAvatarState?.("warning");
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
