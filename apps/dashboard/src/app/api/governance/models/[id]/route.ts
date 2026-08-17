import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelGovernance } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { routeId } from "@/lib/governance/route-id";
import { governanceSession, notFound, unauthorized } from "@/lib/governance/http";

const MODEL_FIELDS = [
  "displayName",
  "description",
  "providerId",
  "approvalStatus",
  "riskLevel",
  "businessLabels",
  "allowedUseCases",
  "bannedUseCases",
  "dataClassesAllowed",
  "licenseType",
  "licenseUrl",
  "provenanceVerified",
  "biasReviewed",
  "safetyReviewed",
  "redTeamResults",
  "contextWindow",
  "parameterScale",
  "reasoningModes",
  "costTier",
  "sectorTags",
  "ownerTeam",
  "businessCriticality",
  "allowedRegions",
  "metadata",
] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const id = await routeId(params);
  const db = getDb();

  const item = await db.query.modelGovernance.findFirst({
    where: eq(modelGovernance.id, id),
  });

  if (!item) return notFound("Model not found");
  return NextResponse.json({ model: item });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;
  const id = await routeId(params);
  const body = await req.json();
  const actorId = await orgActorId(session);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of MODEL_FIELDS) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.approvalStatus) {
    patch.lastReviewedBy = actorId ?? undefined;
    patch.lastReviewedAt = new Date();
  }

  const db = getDb();
  const [item] = await db
    .update(modelGovernance)
    .set(patch)
    .where(eq(modelGovernance.id, id))
    .returning();

  if (!item) return notFound("Model not found");

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
    action: "governance.model.updated",
    entityType: "model_governance",
    entityId: item.id,
    metadata: patch,
  });

  return NextResponse.json({ model: item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;
  const id = await routeId(params);
  const actorId = await orgActorId(session);

  const db = getDb();
  await db.delete(modelGovernance).where(eq(modelGovernance.id, id));

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
    action: "governance.model.deleted",
    entityType: "model_governance",
    entityId: id,
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
