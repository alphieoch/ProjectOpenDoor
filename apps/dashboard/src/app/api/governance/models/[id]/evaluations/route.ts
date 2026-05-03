import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelEvaluations } from "@opendoor/database";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth();
  const db = getDb();

  const items = await db
    .select()
    .from(modelEvaluations)
    .where(eq(modelEvaluations.modelGovernanceId, params.id))
    .orderBy(desc(modelEvaluations.evaluatedAt));

  return NextResponse.json({ evaluations: items });
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
    .insert(modelEvaluations)
    .values({
      modelGovernanceId: params.id,
      organizationId: orgId,
      evaluationName: body.evaluationName,
      evaluationType: body.evaluationType,
      score: body.score,
      scoreUnit: body.scoreUnit || "percent",
      passThreshold: body.passThreshold,
      passed: body.passed,
      details: body.details,
      datasetRef: body.datasetRef,
      evaluatedBy: session.sub as string,
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.evaluation.created",
    entityType: "model_evaluation",
    entityId: item.id,
    metadata: { modelGovernanceId: params.id, evaluationName: body.evaluationName, passed: body.passed },
  });

  return NextResponse.json({ evaluation: item });
}
