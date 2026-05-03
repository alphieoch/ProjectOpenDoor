import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelApprovals, modelGovernance } from "@opendoor/database";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

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

  let filtered = items;
  if (status) {
    filtered = filtered.filter((i) => i.approval.status === status);
  }

  return NextResponse.json({
    approvals: filtered.map((f) => ({ ...f.approval, model: f.model })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  if (!body.modelGovernanceId) {
    return NextResponse.json({ error: "modelGovernanceId is required" }, 400);
  }

  const db = getDb();
  const [item] = await db
    .insert(modelApprovals)
    .values({
      modelGovernanceId: body.modelGovernanceId,
      organizationId: orgId,
      requestedBy: session.sub as string,
      status: "pending",
      reviewNotes: body.reviewNotes,
    })
    .returning();

  // Also update the governance model status to in_review
  await db
    .update(modelGovernance)
    .set({ approvalStatus: "in_review", updatedAt: new Date() })
    .where(eq(modelGovernance.id, body.modelGovernanceId));

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.approval.requested",
    entityType: "model_approval",
    entityId: item.id,
    metadata: { modelGovernanceId: body.modelGovernanceId },
  });

  return NextResponse.json({ approval: item });
}
