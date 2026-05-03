import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelPolicies } from "@opendoor/database";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  const items = await db
    .select()
    .from(modelPolicies)
    .where(eq(modelPolicies.organizationId, orgId))
    .orderBy(desc(modelPolicies.priority), desc(modelPolicies.createdAt));

  return NextResponse.json({ policies: items });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

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
      metadata: body.metadata,
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.policy.created",
    entityType: "model_policy",
    entityId: item.id,
    metadata: { name: body.name, action: body.action, dataClass: body.dataClass },
  });

  return NextResponse.json({ policy: item });
}
