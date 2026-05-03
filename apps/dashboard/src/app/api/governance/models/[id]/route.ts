import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelGovernance } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth();
  const db = getDb();

  const item = await db.query.modelGovernance.findFirst({
    where: eq(modelGovernance.id, params.id),
  });

  if (!item) {
    return NextResponse.json({ error: "Model not found" }, 404);
  }

  return NextResponse.json({ model: item });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const db = getDb();
  const [item] = await db
    .update(modelGovernance)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(eq(modelGovernance.id, params.id))
    .returning();

  if (!item) {
    return NextResponse.json({ error: "Model not found" }, 404);
  }

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.model.updated",
    entityType: "model_governance",
    entityId: item.id,
    metadata: body,
  });

  return NextResponse.json({ model: item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  await db
    .delete(modelGovernance)
    .where(eq(modelGovernance.id, params.id));

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.model.deleted",
    entityType: "model_governance",
    entityId: params.id,
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
