import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizationProviderKeys } from "@opendoor/database";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const { id } = await params;
    const db = getDb();

    const [row] = await db
      .update(organizationProviderKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(organizationProviderKeys.id, id),
          eq(organizationProviderKeys.organizationId, orgId),
          isNull(organizationProviderKeys.revokedAt)
        )
      )
      .returning({
        id: organizationProviderKeys.id,
        providerSlug: organizationProviderKeys.providerSlug,
      });

    if (!row) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    await logAuditEvent({
      organizationId: orgId,
      userId: sessionActorId(session),
      action: "byok.revoked",
      entityType: "organization_provider_key",
      entityId: row.id,
      metadata: { providerSlug: row.providerSlug },
    });

    return NextResponse.json({ success: true, id: row.id });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
