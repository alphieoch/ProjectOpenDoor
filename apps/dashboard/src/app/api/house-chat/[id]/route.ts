import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { houseChatMessages, houseChats, users } from "@opendoor/database";
import { isOrgOrganizer } from "@/lib/house-chat";

async function resolveChatAccess(chatId: string, session: { userId: string; orgId: string; role: string }) {
  const db = getDb();
  const chat = await db.query.houseChats.findFirst({
    where: and(eq(houseChats.id, chatId), eq(houseChats.organizationId, session.orgId)),
  });
  if (!chat) return { error: NextResponse.json({ error: "Chat not found" }, { status: 404 }) };

  if (chat.userId === session.userId) return { chat };

  const organizer = await isOrgOrganizer({
    userId: session.userId,
    orgId: session.orgId,
    role: session.role,
  });
  if (!organizer) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const owner = await db.query.users.findFirst({
    where: eq(users.id, chat.userId),
    columns: { protectedChild: true },
  });
  if (!owner?.protectedChild) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { chat, readOnly: true as const };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await resolveChatAccess(id, {
    userId: session.userId,
    orgId: session.orgId as string,
    role: session.role,
  });
  if ("error" in access && access.error) return access.error;

  const db = getDb();
  const messages = await db
    .select()
    .from(houseChatMessages)
    .where(eq(houseChatMessages.chatId, id))
    .orderBy(asc(houseChatMessages.createdAt));

  return NextResponse.json({
    chat: {
      id: access.chat!.id,
      title: access.chat!.title || "New chat",
      userId: access.chat!.userId,
      updatedAt: access.chat!.updatedAt,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      mode: m.mode,
      reasoning: m.reasoning,
      createdAt: m.createdAt,
    })),
    readOnly: Boolean(access.readOnly),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await resolveChatAccess(id, {
    userId: session.userId,
    orgId: session.orgId as string,
    role: session.role,
  });
  if ("error" in access && access.error) return access.error;

  const db = getDb();
  await db.delete(houseChats).where(eq(houseChats.id, id));
  return NextResponse.json({ ok: true });
}
