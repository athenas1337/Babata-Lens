import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { authenticateRequest, unauthorizedResponse } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
  const userId = auth.user.id;

  try {
    const list = await db.listConversations(userId);
    return NextResponse.json({ conversations: list });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list conversations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return unauthorizedResponse();
  }

  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = checkRateLimit("ip", ip, { windowMs: 60 * 1000, max: 30 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const db = getDatabase();
  const userId = auth.user.id;

  let body: { title?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body optional
  }

  const title = (body.title || "New Analysis").slice(0, 120);

  try {
    const conv = await db.createConversation(userId, title);
    return NextResponse.json({ conversation: conv }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}