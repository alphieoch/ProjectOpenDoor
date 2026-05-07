import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants } from "@opendoor/database";
import { eq, and } from "drizzle-orm";

async function getOwned(id: string, orgId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, orgId)));
  return row ?? null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const existing = await getOwned(id, session.orgId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const db = getDb();
  const [updated] = await db
    .update(aiAssistants)
    .set({
      name:           body.name           ?? existing.name,
      slug:           body.slug           ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") : existing.slug,
      description:    body.description    !== undefined ? body.description    : existing.description,
      avatarLetter:   body.avatarLetter   !== undefined ? body.avatarLetter   : existing.avatarLetter,
      primaryColor:   body.primaryColor   ?? existing.primaryColor,
      modelId:        body.modelId        ?? existing.modelId,
      systemPrompt:   body.systemPrompt   !== undefined ? body.systemPrompt   : existing.systemPrompt,
      welcomeMessage: body.welcomeMessage !== undefined ? body.welcomeMessage : existing.welcomeMessage,
      maxMessages:    body.maxMessages    !== undefined ? (body.maxMessages ? parseInt(body.maxMessages) : null) : existing.maxMessages,
      visibility:     body.visibility     ?? existing.visibility,
      monetization:   body.monetization   ?? existing.monetization,
      priceCents:     body.priceCents     !== undefined ? parseInt(body.priceCents) : existing.priceCents,
      updatedAt:      new Date(),
    })
    .where(eq(aiAssistants.id, id))
    .returning();

  return NextResponse.json({ assistant: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const existing = await getOwned(id, session.orgId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getDb();
  await db.update(aiAssistants).set({ enabled: false, updatedAt: new Date() }).where(eq(aiAssistants.id, id));
  return NextResponse.json({ ok: true });
}
