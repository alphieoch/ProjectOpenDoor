import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { apiKeys } from "@opendoor/database";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { SYSTEM_ASSISTANT_KEY_NAME } from "@opendoor/shared";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const { id } = await params;
    const db = getDb();

    const existing = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.id, id),
        eq(apiKeys.organizationId, orgId),
        isNull(apiKeys.revokedAt)
      ),
      columns: { id: true, name: true },
    });
    if (!existing || existing.name === SYSTEM_ASSISTANT_KEY_NAME) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const [row] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(apiKeys.id, existing.id), eq(apiKeys.organizationId, orgId)))
      .returning({ id: apiKeys.id, name: apiKeys.name });

    if (!row) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    await logAuditEvent({
      organizationId: orgId,
      userId: sessionActorId(session),
      action: "api_key.revoked",
      entityType: "api_key",
      entityId: row.id,
      metadata: { name: row.name },
    });

    return NextResponse.json({ success: true, id: row.id });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
