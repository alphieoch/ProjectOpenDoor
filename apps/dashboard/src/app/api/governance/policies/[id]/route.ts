import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelPolicies } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { routeId } from "@/lib/governance/route-id";
import { governanceSession, notFound, unauthorized } from "@/lib/governance/http";

const POLICY_FIELDS = [
  "name",
  "description",
  "dataClass",
  "modelGovernanceId",
  "modelIdPattern",
  "userRolePattern",
  "action",
  "fallbackModelId",
  "requireHumanApproval",
  "scope",
  "enabled",
  "priority",
  "metadata",
] as const;

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
  for (const key of POLICY_FIELDS) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  const db = getDb();
  const [item] = await db
    .update(modelPolicies)
    .set(patch)
    .where(and(eq(modelPolicies.id, id), eq(modelPolicies.organizationId, orgId)))
    .returning();

  if (!item) return notFound("Policy not found");

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
    action: "governance.policy.updated",
    entityType: "model_policy",
    entityId: item.id,
    metadata: patch,
  });

  return NextResponse.json({ policy: item });
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
  await db
    .delete(modelPolicies)
    .where(and(eq(modelPolicies.id, id), eq(modelPolicies.organizationId, orgId)));

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
    action: "governance.policy.deleted",
    entityType: "model_policy",
    entityId: id,
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
