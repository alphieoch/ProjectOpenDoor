import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelApprovals, modelGovernance } from "@opendoor/database";
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
    .update(modelApprovals)
    .set({
      status: body.status,
      reviewedBy: session.sub as string,
      reviewedAt: new Date(),
      reviewNotes: body.reviewNotes,
      updatedAt: new Date(),
    })
    .where(and(eq(modelApprovals.id, params.id), eq(modelApprovals.organizationId, orgId)))
    .returning();

  if (!item) {
    return NextResponse.json({ error: "Approval not found" }, 404);
  }

  // Sync governance model status
  await db
    .update(modelGovernance)
    .set({ approvalStatus: body.status, updatedAt: new Date() })
    .where(eq(modelGovernance.id, item.modelGovernanceId));

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.approval.reviewed",
    entityType: "model_approval",
    entityId: item.id,
    metadata: { status: body.status, reviewNotes: body.reviewNotes },
  });

  return NextResponse.json({ approval: item });
}
