import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizationProviderKeys } from "@opendoor/database";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function DELETE(
  _: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const db = getDb();

  const [row] = await db
    .update(organizationProviderKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(organizationProviderKeys.id, params.id),
        eq(organizationProviderKeys.organizationId, orgId)
      )
    )
    .returning({ id: organizationProviderKeys.id, providerSlug: organizationProviderKeys.providerSlug });

  if (!row) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "byok.revoked",
    entityType: "organization_provider_key",
    entityId: row.id,
    metadata: { providerSlug: row.providerSlug },
  });

  return NextResponse.json({ success: true });
}
