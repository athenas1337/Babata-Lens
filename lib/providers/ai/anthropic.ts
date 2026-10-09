import {
  AIProvider,
  AgentInput,
  AgentMessage,
  AgentOutput,
  ProviderCapability,
  ToolCallRequest,
} from "../interfaces";
import { logger } from "../../observability/logger";

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export class AnthropicProvider implements AIProvider {
  id = "anthropic";
  name = "Anthropic Claude";
  capability: ProviderCapability = "ai";
  requiredEnvVars = ["ANTHROPIC_API_KEY"];

  private apiKey?: string;
  private defaultModel = "claude-sonnet-5";
  private healthModel = "claude-haiku-4-5";
  private baseUrl = "https://api.anthropic.com/v1/messages";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.healthModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      // 200 = success, 400 = reachable but bad request (still proves auth path).
      return res.status === 200 || res.status === 400;
    } catch {
      return false;
    }
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
  }

  /**
   * Convert the internal agent transcript into Anthropic's message format:
   * - `system` messages become the top-level `system` parameter.
   * - assistant tool calls become `tool_use` blocks.
   * - tool results become `tool_result` blocks in a `user` message.
   * - consecutive same-role messages are merged (Anthropic requires alternation).
   */
  private buildMessages(messages: AgentMessage[]): {
    system: string;
    messages: AnthropicMessage[];
  } {
    const systemParts: string[] = [];
    const out: AnthropicMessage[] = [];

    const pushMessage = (role: "user" | "assistant", block: AnthropicContentBlock) => {
      const last = out[out.length - 1];
      if (last && last.role === role) {
        if (Array.isArray(last.content)) {
          last.content.push(block);
        } else {
          last.content = [{ type: "text", text: last.content }, block];
        }
      } else {
        out.push({ role, content: [block] });
      }
    };

    for (const m of messages) {
      if (m.role === "system") {
        if (m.content.trim()) systemParts.push(m.content.trim());
        continue;
      }

      if (m.role === "user") {
        pushMessage("user", { type: "text", text: m.content });
        continue;
      }

      if (m.role === "tool") {
        pushMessage("user", {
          type: "tool_result",
          tool_use_id: m.toolCallId || m.name || "unknown_tool",
          content: m.content,
        });
        continue;
      }

      // assistant
      const blocks: AnthropicContentBlock[] = [];
      if (m.content.trim()) blocks.push({ type: "text", text: m.content });
      for (const call of m.toolCalls || []) {
        blocks.push({
          type: "tool_use",
          id: call.id || `toolu_${Math.random().toString(36).slice(2, 12)}`,
          name: call.toolName,
          input: call.parameters || {},
        });
      }
      if (blocks.length === 0) blocks.push({ type: "text", text: "" });

      const last = out[out.length - 1];
      if (last && last.role === "assistant") {
        last.content = ([] as AnthropicContentBlock[]).concat(last.content, blocks);
      } else {
        out.push({ role: "assistant", content: blocks });
      }
    }

    // Anthropic requires the first message to be from the user.
    if (out.length === 0 || out[0].role !== "user") {
      out.unshift({ role: "user", content: [{ type: "text", text: "(conversation start)" }] });
    }

    return { system: systemParts.join("\n\n"), messages: out };
  }

  async generateResponse(input: AgentInput): Promise<AgentOutput> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key is not configured.");
    }

    const { system, messages } = this.buildMessages(input.messages);

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      max_tokens: 4096,
      temperature: input.temperature ?? 0.2,
      messages,
    };

    if (system) body.system = system;

    if (input.tools && input.tools.length > 0) {
      body.tools = input.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
      body.tool_choice = { type: "auto" };
    }

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error("Anthropic API error", {
        provider: "anthropic",
        statusCode: res.status,
        data: { error: errText },
      });
      throw new Error(`Anthropic provider request failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      content: AnthropicContentBlock[];
      model?: string;
    };

    const textParts = json.content
      .filter((c): c is AnthropicTextBlock => c.type === "text")
      .map((c) => c.text);

    const toolCalls: ToolCallRequest[] = json.content
      .filter((c): c is AnthropicToolUseBlock => c.type === "tool_use")
      .map((c) => ({
        id: c.id,
        toolName: c.name,
        parameters: c.input || {},
      }));

    return {
      text: textParts.join("\n").trim(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model: json.model || this.defaultModel,
      sourceMeta: {
        provider: this.id,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
