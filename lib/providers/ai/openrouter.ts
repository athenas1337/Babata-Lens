import {
  AIProvider,
  AgentInput,
  AgentMessage,
  AgentOutput,
  ProviderCapability,
  ToolCallRequest,
} from "../interfaces";
import { logger } from "../../observability/logger";
import { getSecret } from "../../config/env";

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export class OpenRouterProvider implements AIProvider {
  id = "openrouter";
  name = "OpenRouter";
  capability: ProviderCapability = "ai";
  requiredEnvVars = ["OPENROUTER_API_KEY"];

  private apiKey?: string;
  // OpenRouter slugs are "vendor/model". Override with OPENROUTER_MODEL when the
  // account prefers a different model.
  private defaultModel = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getSecret("OPENROUTER_API_KEY");
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /** Map internal transcript to OpenAI-compatible chat messages. */
  private buildMessages(messages: AgentMessage[]): OpenAIMessage[] {
    const out: OpenAIMessage[] = [];

    for (const m of messages) {
      if (m.role === "tool") {
        out.push({
          role: "tool",
          tool_call_id: m.toolCallId || m.name || "unknown_tool",
          content: m.content,
        });
        continue;
      }

      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        out.push({
          role: "assistant",
          content: m.content.trim() ? m.content : null,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id || `call_${Math.random().toString(36).slice(2, 12)}`,
            type: "function",
            function: {
              name: c.toolName,
              arguments: JSON.stringify(c.parameters || {}),
            },
          })),
        });
        continue;
      }

      out.push({
        role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      });
    }

    return out;
  }

  async generateResponse(input: AgentInput): Promise<AgentOutput> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is not configured.");
    }

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: this.buildMessages(input.messages),
      temperature: input.temperature ?? 0.2,
    };

    if (input.tools && input.tools.length > 0) {
      body.tools = input.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = "auto";
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://babata.lens",
        "X-Title": "Babata Lens",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error("OpenRouter API error", {
        provider: "openrouter",
        statusCode: res.status,
        data: { error: errText },
      });
      throw new Error(`OpenRouter provider request failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      choices: { message: { content: string | null; tool_calls?: OpenAIToolCall[] } }[];
      model?: string;
    };

    const choice = json.choices?.[0]?.message;
    const toolCalls: ToolCallRequest[] = [];
    for (const c of choice?.tool_calls || []) {
      let parameters: Record<string, unknown> = {};
      try {
        parameters = c.function.arguments ? JSON.parse(c.function.arguments) : {};
      } catch {
        logger.warn("Failed to parse OpenRouter tool arguments", {
          provider: this.id,
          data: { raw: c.function.arguments },
        });
        // Never execute a tool with an unparsed/empty argument blob.
        continue;
      }
      toolCalls.push({ id: c.id, toolName: c.function.name, parameters });
    }

    return {
      text: (choice?.content || "").trim(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model: json.model || this.defaultModel,
      sourceMeta: {
        provider: this.id,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
