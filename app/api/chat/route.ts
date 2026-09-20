import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BabataAgentOrchestrator, BabataAvatarState } from "@/lib/agent/orchestrator";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";
import { logger } from "@/lib/observability/logger";

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().optional(),
  stream: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  // Authentication check
  const auth = await authenticateRequest(req);
  if (!auth) {
    return unauthorizedResponse();
  }

  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit("ip", ip, { windowMs: 60 * 1000, max: 20 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { message, conversationId, stream } = parsed.data;
  const orchestrator = new BabataAgentOrchestrator();

  if (!stream) {
    try {
      const result = await orchestrator.processMessage(message, { conversationId });
      return NextResponse.json(result);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Internal processing error";
      logger.error("Chat non-stream error", { errorCode: "CHAT_ERR", data: { error: errorMessage } });
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  }

  // SSE Streaming response
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller might already be closed
        }
      };

      try {
        await orchestrator.processMessage(message, {
          conversationId,
          callbacks: {
            onAvatarState: (state: BabataAvatarState) => {
              sendEvent("avatar_state", { state });
            },
            onToolCallStart: (tool: string, input: Record<string, unknown>) => {
              sendEvent("tool_call_start", { tool, input });
            },
            onToolCallEnd: (tool: string, durationMs: number, success: boolean, error?: string) => {
              sendEvent("tool_call_end", { tool, durationMs, success, error });
            },
            onToken: (token: string) => {
              sendEvent("token", { token });
            },
            onDataSource: (provider: string, timestamp: string) => {
              sendEvent("data_source", { provider, timestamp });
            },
            onError: (code: string, msg: string, fallbackUsed: boolean) => {
              sendEvent("error", { code, message: msg, fallbackUsed });
            },
            onDone: (convId: string, msgId: string) => {
              sendEvent("done", { conversationId: convId, messageId: msgId });
            },
          },
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Stream processing failure";
        sendEvent("error", { code: "ORCHESTRATOR_EXCEPTION", message: errorMsg, fallbackUsed: false });
        sendEvent("avatar_state", { state: "error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}