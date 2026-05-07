import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants } from "@opendoor/database";
import { eq, and } from "drizzle-orm";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const db = getDb();

  const [existing] = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, session.orgId)));

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nowPublished = existing.publishedAt ? null : new Date();
  const [updated] = await db
    .update(aiAssistants)
    .set({ publishedAt: nowPublished, updatedAt: new Date() })
    .where(eq(aiAssistants.id, id))
    .returning();

  return NextResponse.json({ assistant: updated });
}
