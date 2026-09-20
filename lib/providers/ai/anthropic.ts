import {
  AIProvider,
  AgentInput,
  AgentOutput,
  ProviderCapability,
} from "../interfaces";
import { logger } from "../../observability/logger";

export class AnthropicProvider implements AIProvider {
  id = "anthropic";
  name = "Anthropic Claude";
  capability: ProviderCapability = "ai";
  requiredEnvVars = ["ANTHROPIC_API_KEY"];

  private apiKey?: string;
  private defaultModel = "claude-3-5-sonnet-20241022";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      return res.status === 200 || res.status === 400; // valid credential response
    } catch {
      return false;
    }
  }

  async generateResponse(input: AgentInput): Promise<AgentOutput> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key is not configured.");
    }

    const messages = input.messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      max_tokens: 2048,
      temperature: input.temperature ?? 0.2,
      messages,
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
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
      content: { type: string; text?: string }[];
      model: string;
    };
    const text = json.content.find((c) => c.type === "text")?.text || "";

    return {
      text,
      model: json.model || this.defaultModel,
      sourceMeta: {
        provider: "anthropic",
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
