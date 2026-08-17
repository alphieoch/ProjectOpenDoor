import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelApprovals, modelGovernance } from "@opendoor/database";
import { eq, desc } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { badRequest, emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const db = getDb();
    const items = await db
      .select({
        approval: modelApprovals,
        model: modelGovernance,
      })
      .from(modelApprovals)
      .innerJoin(modelGovernance, eq(modelApprovals.modelGovernanceId, modelGovernance.id))
      .where(eq(modelApprovals.organizationId, orgId))
      .orderBy(desc(modelApprovals.createdAt));

    const filtered = status ? items.filter((i) => i.approval.status === status) : items;

    return NextResponse.json({
      approvals: filtered.map((f) => ({ ...f.approval, model: f.model })),
    });
  } catch (err) {
    return NextResponse.json(emptyOnMissingTable({ approvals: [] }, err));
  }
}

export async function POST(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;
  const body = await req.json();

  if (!body.modelGovernanceId) {
    return badRequest("modelGovernanceId is required");
  }

  const actorId = await orgActorId(session);
  if (!actorId) return badRequest("No workspace user is available to request approval");

  const db = getDb();
  const [item] = await db
    .insert(modelApprovals)
    .values({
      modelGovernanceId: body.modelGovernanceId,
      organizationId: orgId,
      requestedBy: actorId,
      status: "pending",
      reviewNotes: body.reviewNotes,
    })
    .returning();

  await db
    .update(modelGovernance)
    .set({ approvalStatus: "in_review", updatedAt: new Date() })
    .where(eq(modelGovernance.id, body.modelGovernanceId));

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId,
    action: "governance.approval.requested",
    entityType: "model_approval",
    entityId: item.id,
    metadata: { modelGovernanceId: body.modelGovernanceId },
  });

  return NextResponse.json({ approval: item });
}
