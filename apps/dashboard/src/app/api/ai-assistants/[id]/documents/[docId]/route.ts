import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants, assistantDocuments } from "@opendoor/database";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const session = await requireAuth();
  const { id, docId } = await params;
  const db = getDb();

  // Confirm assistant ownership
  const [assistant] = await db
    .select({ id: aiAssistants.id })
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, session.orgId)));
  if (!assistant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .delete(assistantDocuments)
    .where(and(eq(assistantDocuments.id, docId), eq(assistantDocuments.assistantId, id)));

  return NextResponse.json({ ok: true });
}
