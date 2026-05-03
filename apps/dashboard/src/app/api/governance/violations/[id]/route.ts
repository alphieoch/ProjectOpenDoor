import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { policyViolations } from "@opendoor/database";
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
    .update(policyViolations)
    .set({
      resolvedAt: body.resolved ? new Date() : undefined,
      resolvedBy: body.resolved ? (session.sub as string) : undefined,
    })
    .where(and(eq(policyViolations.id, params.id), eq(policyViolations.organizationId, orgId)))
    .returning();

  if (!item) {
    return NextResponse.json({ error: "Violation not found" }, 404);
  }

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.violation.resolved",
    entityType: "policy_violation",
    entityId: item.id,
    metadata: { resolved: body.resolved },
  });

  return NextResponse.json({ violation: item });
}
