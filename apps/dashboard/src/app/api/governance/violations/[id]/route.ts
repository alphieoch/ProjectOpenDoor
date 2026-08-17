import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { policyViolations } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { routeId } from "@/lib/governance/route-id";
import { governanceSession, notFound, unauthorized } from "@/lib/governance/http";

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

  const db = getDb();
  const [item] = await db
    .update(policyViolations)
    .set({
      resolvedAt: body.resolved ? new Date() : null,
      resolvedBy: body.resolved ? actorId : null,
    })
    .where(and(eq(policyViolations.id, id), eq(policyViolations.organizationId, orgId)))
    .returning();

  if (!item) return notFound("Violation not found");

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
    action: "governance.violation.resolved",
    entityType: "policy_violation",
    entityId: item.id,
    metadata: { resolved: body.resolved },
  });

  return NextResponse.json({ violation: item });
}
