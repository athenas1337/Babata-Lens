import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return unauthorizedResponse();
  }

  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit("ip", ip, { windowMs: 60 * 1000, max: 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const db = getDatabase();
  const { id } = params;

  try {
    const conversation = await db.getConversation(id);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    // Ownership check — prevents cross-tenant reads.
    if (conversation.userId !== auth.user.id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const messages = await db.getMessages(id);
    return NextResponse.json({ conversation, messages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to retrieve conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return unauthorizedResponse();
  }

  const db = getDatabase();
  const { id } = params;

  try {
    const conversation = await db.getConversation(id);
    if (!conversation || conversation.userId !== auth.user.id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    await db.deleteConversation(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}