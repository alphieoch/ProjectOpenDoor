import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants, assistantConnections, assistantConnectionTools } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { getComposio } from "@/lib/composio/client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; appSlug: string }> },
) {
  const session = await requireAuth();
  const { id, appSlug } = await params;
  const db = getDb();

  const [assistant] = await db
    .select({ id: aiAssistants.id })
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, session.orgId)));

  if (!assistant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [conn] = await db
    .select()
    .from(assistantConnections)
    .where(and(
      eq(assistantConnections.assistantId, id),
      eq(assistantConnections.appSlug, appSlug),
    ));

  if (conn) {
    // Delete tools first (cascade should handle this, but be explicit)
    await db
      .delete(assistantConnectionTools)
      .where(eq(assistantConnectionTools.connectionId, conn.id));

    if (conn.connectedAccountId) {
      try {
        const composio = getComposio();
        await composio.connectedAccounts.delete(conn.connectedAccountId);
      } catch (err) {
        console.error("Composio delete connected account error:", err);
      }
    }

    await db
      .delete(assistantConnections)
      .where(eq(assistantConnections.id, conn.id));
  }

  return NextResponse.json({ ok: true });
}
