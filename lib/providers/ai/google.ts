import {
  AIProvider,
  AgentInput,
  AgentMessage,
  AgentOutput,
  ProviderCapability,
  ToolCallRequest,
} from "../interfaces";
import { logger } from "../../observability/logger";

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

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

  /**
   * Build Gemini contents. `system` messages are hoisted into systemInstruction.
   * Tool results are returned as functionResponse parts in a `user` turn.
   */
  private buildContents(messages: AgentMessage[]): {
    systemInstruction?: { parts: GeminiPart[] };
    contents: GeminiContent[];
  } {
    const systemParts: string[] = [];
    const contents: GeminiContent[] = [];

    for (const m of messages) {
      if (m.role === "system") {
        if (m.content.trim()) systemParts.push(m.content.trim());
        continue;
      }

      if (m.role === "tool") {
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: m.name || m.toolCallId || "unknown_tool",
                response: { content: m.content },
              },
            },
          ],
        });
        continue;
      }

      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        const parts: GeminiPart[] = [];
        if (m.content.trim()) parts.push({ text: m.content });
        for (const call of m.toolCalls) {
          parts.push({ functionCall: { name: call.toolName, args: call.parameters || {} } });
        }
        contents.push({ role: "model", parts });
        continue;
      }

      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }

    return {
      systemInstruction: systemParts.length
        ? { parts: [{ text: systemParts.join("\n\n") }] }
        : undefined,
      contents,
    };
  }

  async generateResponse(input: AgentInput): Promise<AgentOutput> {
    if (!this.apiKey) {
      throw new Error("Google AI API key is not configured.");
    }

    const { systemInstruction, contents } = this.buildContents(input.messages);

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    if (input.tools && input.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: input.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.defaultModel}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
      candidates?: { content: { parts: GeminiPart[] } }[];
    };

    const parts = json.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n")
      .trim();

    const toolCalls: ToolCallRequest[] = parts
      .filter((p) => p.functionCall)
      .map((p, idx) => ({
        id: `call_${idx}_${Date.now()}`,
        toolName: p.functionCall!.name,
        parameters: p.functionCall!.args || {},
      }));

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model: this.defaultModel,
      sourceMeta: {
        provider: this.id,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
