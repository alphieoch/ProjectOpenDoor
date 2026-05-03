import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelComplianceMappings, complianceControls } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth();
  const db = getDb();

  const items = await db
    .select({
      mappingId: modelComplianceMappings.id,
      controlId: complianceControls.id,
      framework: complianceControls.framework,
      controlCode: complianceControls.controlCode,
      controlName: complianceControls.controlName,
      requirementLevel: complianceControls.requirementLevel,
      status: modelComplianceMappings.status,
      evidence: modelComplianceMappings.evidence,
      assessedAt: modelComplianceMappings.assessedAt,
    })
    .from(modelComplianceMappings)
    .innerJoin(complianceControls, eq(modelComplianceMappings.controlId, complianceControls.id))
    .where(eq(modelComplianceMappings.modelGovernanceId, params.id));

  return NextResponse.json({ compliance: items });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const db = getDb();
  const [item] = await db
    .insert(modelComplianceMappings)
    .values({
      modelGovernanceId: params.id,
      controlId: body.controlId,
      status: body.status || "not_assessed",
      evidence: body.evidence,
      assessedBy: session.sub as string,
      assessedAt: new Date(),
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.compliance.updated",
    entityType: "model_compliance_mapping",
    entityId: item.id,
    metadata: { modelGovernanceId: params.id, controlId: body.controlId, status: body.status },
  });

  return NextResponse.json({ mapping: item });
}
