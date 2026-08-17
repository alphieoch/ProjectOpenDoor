import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { houseChats, users } from "@opendoor/database";
import {
  ensureHouseChatSeat,
  getHouseChatAllowance,
  isOrgOrganizer,
  loadProtectedChild,
} from "@/lib/house-chat";

export async function GET(req: NextRequest) {
  const session = await requireAuth().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.orgId as string;
  const db = getDb();
  const memberId = req.nextUrl.searchParams.get("memberId");

  let targetUserId = session.userId;
  if (memberId && memberId !== session.userId) {
    const organizer = await isOrgOrganizer({
      userId: session.userId,
      orgId,
      role: session.role,
    });
    if (!organizer) {
      return NextResponse.json({ error: "Only a parent/organizer can view another member’s chats" }, { status: 403 });
    }
    const member = await db.query.users.findFirst({
      where: and(eq(users.id, memberId), eq(users.organizationId, orgId)),
      columns: { id: true },
    });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    targetUserId = memberId;
  }

  let allowance;
  try {
    await ensureHouseChatSeat({
      userId: targetUserId,
      orgId,
      email: session.email,
    });
    allowance = await getHouseChatAllowance(targetUserId, orgId, undefined, {
      unlimited: Boolean(session.isSiteAdmin) && targetUserId === session.userId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load chat allowance";
    console.error("[house-chat] allowance", err);
    const missing = /house_chat_usage|does not exist/i.test(message);
    const unreachable = /ENOENT|ECONNREFUSED|connect/i.test(message);
    return NextResponse.json(
      {
        error: missing
          ? "OpenDoor Chat tables are missing. Apply migration 0040_house_chat."
          : unreachable
            ? "Database is unreachable from this machine. House chat needs local Postgres or the Cloud SQL proxy."
            : message || "Could not load chat allowance",
      },
      { status: missing || unreachable ? 503 : 500 }
    );
  }

  const [threads, protectedChild] = await Promise.all([
    db
      .select({
        id: houseChats.id,
        title: houseChats.title,
        updatedAt: houseChats.updatedAt,
        createdAt: houseChats.createdAt,
        userId: houseChats.userId,
      })
      .from(houseChats)
      .where(and(eq(houseChats.userId, targetUserId), eq(houseChats.organizationId, orgId)))
      .orderBy(desc(houseChats.updatedAt))
      .limit(100),
    loadProtectedChild(session.userId),
  ]);

  let children: Array<{ id: string; name: string; email: string }> = [];
  const organizer = await isOrgOrganizer({
    userId: session.userId,
    orgId,
    role: session.role,
  });
  if (organizer) {
    const kids = await db.query.users.findMany({
      where: and(eq(users.organizationId, orgId), eq(users.protectedChild, true)),
      columns: { id: true, name: true, email: true },
    });
    children = kids.map((k) => ({
      id: k.id,
      name: k.name || k.email.split("@")[0],
      email: k.email,
    }));
  }

  return NextResponse.json({
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title || "New chat",
      updatedAt: t.updatedAt?.toISOString?.() ?? t.updatedAt,
      createdAt: t.createdAt?.toISOString?.() ?? t.createdAt,
      userId: t.userId,
    })),
    allowance,
    protectedChild,
    viewingMemberId: targetUserId,
    children,
    isOrganizer: organizer,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.orgId as string;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.slice(0, 120) : null;

  try {
    await ensureHouseChatSeat({
      userId: session.userId,
      orgId,
      email: session.email,
    });
  } catch (err) {
    console.error("[house-chat] ensure seat", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create your chat seat" },
      { status: 500 }
    );
  }

  const [chat] = await db
    .insert(houseChats)
    .values({
      organizationId: orgId,
      userId: session.userId,
      title,
    })
    .returning();

  return NextResponse.json({
    id: chat!.id,
    title: chat!.title || "New chat",
    createdAt: chat!.createdAt,
    updatedAt: chat!.updatedAt,
  });
}
