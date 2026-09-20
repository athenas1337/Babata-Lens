import {
  AIProvider,
  AgentInput,
  AgentOutput,
  ProviderCapability,
} from "../interfaces";
import { logger } from "../../observability/logger";

export class GoogleAIProvider implements AIProvider {
  id = "google";
  name = "Google Gemini";
  capability: ProviderCapability = "ai";
  requiredEnvVars = ["GOOGLE_AI_API_KEY"];

  private apiKey?: string;
  private defaultModel = "gemini-1.5-pro";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_AI_API_KEY;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async generateResponse(input: AgentInput): Promise<AgentOutput> {
    if (!this.apiKey) {
      throw new Error("Google AI API key is not configured.");
    }

    const contents = input.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.defaultModel}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error("Google AI API error", {
        provider: "google",
        statusCode: res.status,
        data: { error: errText },
      });
      throw new Error(`Google AI provider request failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      candidates?: { content: { parts: { text: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      text,
      model: this.defaultModel,
      sourceMeta: {
        provider: "google",
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
