import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET(req: NextRequest) {
  const db = getDatabase();
  const userId = req.headers.get("x-user-id") || "operator-01";

  try {
    const list = await db.listConversations(userId);
    return NextResponse.json({ conversations: list });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list conversations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getDatabase();
  const userId = req.headers.get("x-user-id") || "operator-01";

  let body: { title?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body optional
  }

  const title = body.title || "New Analysis";

  try {
    const conv = await db.createConversation(userId, title);
    return NextResponse.json({ conversation: conv }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}