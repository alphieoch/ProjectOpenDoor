import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelApprovals, modelGovernance } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { routeId } from "@/lib/governance/route-id";
import { badRequest, governanceSession, notFound, unauthorized } from "@/lib/governance/http";

const STATUSES = new Set(["pending", "in_review", "approved", "rejected", "deprecated"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;
  const id = await routeId(params);
  const body = await req.json();

  if (!STATUSES.has(body.status)) {
    return badRequest("status must be pending, in_review, approved, rejected, or deprecated");
  }

  const actorId = await orgActorId(session);
  const db = getDb();
  const [item] = await db
    .update(modelApprovals)
    .set({
      status: body.status,
      reviewedBy: actorId ?? undefined,
      reviewedAt: new Date(),
      reviewNotes: body.reviewNotes,
      updatedAt: new Date(),
    })
    .where(and(eq(modelApprovals.id, id), eq(modelApprovals.organizationId, orgId)))
    .returning();

  if (!item) return notFound("Approval not found");

  await db
    .update(modelGovernance)
    .set({
      approvalStatus: body.status,
      lastReviewedBy: actorId ?? undefined,
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(modelGovernance.id, item.modelGovernanceId));

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
    action: "governance.approval.reviewed",
    entityType: "model_approval",
    entityId: item.id,
    metadata: { status: body.status, reviewNotes: body.reviewNotes },
  });

  return NextResponse.json({ approval: item });
}
