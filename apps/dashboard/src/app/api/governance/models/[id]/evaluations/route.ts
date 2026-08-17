import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelEvaluations } from "@opendoor/database";
import { eq, desc } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { routeId } from "@/lib/governance/route-id";
import { emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const id = await routeId(params);

  try {
    const db = getDb();
    const items = await db
      .select()
      .from(modelEvaluations)
      .where(eq(modelEvaluations.modelGovernanceId, id))
      .orderBy(desc(modelEvaluations.evaluatedAt));

    return NextResponse.json({ evaluations: items });
  } catch (err) {
    return NextResponse.json(emptyOnMissingTable({ evaluations: [] }, err));
  }
}

export async function POST(
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
    .insert(modelEvaluations)
    .values({
      modelGovernanceId: id,
      organizationId: orgId,
      evaluationName: body.evaluationName,
      evaluationType: body.evaluationType,
      score: body.score,
      scoreUnit: body.scoreUnit || "percent",
      passThreshold: body.passThreshold,
      passed: body.passed,
      details: body.details,
      datasetRef: body.datasetRef,
      evaluatedBy: actorId ?? undefined,
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: actorId ?? undefined,
    action: "governance.evaluation.created",
    entityType: "model_evaluation",
    entityId: item.id,
    metadata: { modelGovernanceId: id, evaluationName: body.evaluationName, passed: body.passed },
  });

  return NextResponse.json({ evaluation: item });
}
