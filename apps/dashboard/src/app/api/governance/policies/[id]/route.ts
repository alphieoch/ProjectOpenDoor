import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelPolicies } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const db = getDb();
  const [item] = await db
    .update(modelPolicies)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(and(eq(modelPolicies.id, params.id), eq(modelPolicies.organizationId, orgId)))
    .returning();

  if (!item) {
    return NextResponse.json({ error: "Policy not found" }, 404);
  }

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.policy.updated",
    entityType: "model_policy",
    entityId: item.id,
    metadata: body,
  });

  return NextResponse.json({ policy: item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  await db
    .delete(modelPolicies)
    .where(and(eq(modelPolicies.id, params.id), eq(modelPolicies.organizationId, orgId)));

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.policy.deleted",
    entityType: "model_policy",
    entityId: params.id,
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
