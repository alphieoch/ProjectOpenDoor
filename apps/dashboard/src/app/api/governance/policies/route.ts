import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelPolicies } from "@opendoor/database";
import { eq, desc } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET() {
  const session = await governanceSession();
  if (!session) return unauthorized();

  try {
    const db = getDb();
    const items = await db
      .select()
      .from(modelPolicies)
      .where(eq(modelPolicies.organizationId, session.orgId))
      .orderBy(desc(modelPolicies.priority), desc(modelPolicies.createdAt));

    return NextResponse.json({ policies: items });
  } catch (err) {
    return NextResponse.json(emptyOnMissingTable({ policies: [] }, err));
  }
}

export async function POST(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;
  const body = await req.json();
  const actorId = await orgActorId(session);

  const db = getDb();
  const [item] = await db
    .insert(modelPolicies)
    .values({
      organizationId: orgId,
      name: body.name,
      description: body.description,
      dataClass: body.dataClass,
      modelGovernanceId: body.modelGovernanceId,
      modelIdPattern: body.modelIdPattern,
      userRolePattern: body.userRolePattern,
      action: body.action,
      fallbackModelId: body.fallbackModelId,
      requireHumanApproval: body.requireHumanApproval || false,
      priority: body.priority || 100,
      enabled: body.enabled !== false,
      scope: body.scope || "organization",
      metadata: body.metadata,
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
    action: "governance.policy.created",
    entityType: "model_policy",
    entityId: item.id,
    metadata: { name: body.name, action: body.action, dataClass: body.dataClass },
  });

  return NextResponse.json({ policy: item });
}
