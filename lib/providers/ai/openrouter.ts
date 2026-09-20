import {
  AIProvider,
  AgentInput,
  AgentOutput,
  ProviderCapability,
} from "../interfaces";
import { logger } from "../../observability/logger";

export class OpenRouterProvider implements AIProvider {
  id = "openrouter";
  name = "OpenRouter";
  capability: ProviderCapability = "ai";
  requiredEnvVars = ["OPENROUTER_API_KEY"];

  private apiKey?: string;
  private defaultModel = "anthropic/claude-3.5-sonnet";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY;
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

  async generateResponse(input: AgentInput): Promise<AgentOutput> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is not configured.");
    }

    const messages = input.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://babata.lens",
        "X-Title": "Babata Lens",
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages,
        temperature: input.temperature ?? 0.2,
      }),
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
      choices: { message: { content: string } }[];
      model: string;
    };
    const text = json.choices[0]?.message?.content || "";

    return {
      text,
      model: json.model || this.defaultModel,
      sourceMeta: {
        provider: "openrouter",
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
