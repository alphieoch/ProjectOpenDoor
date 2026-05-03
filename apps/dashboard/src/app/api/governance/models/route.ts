import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelGovernance, modelEvaluations, modelComplianceMappings, complianceControls } from "@opendoor/database";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  const items = await db.query.modelGovernance.findMany({
    orderBy: [desc(modelGovernance.updatedAt)],
  });

  // Enrich with latest evaluation scores and compliance status
  const enriched = await Promise.all(
    items.map(async (item) => {
      const evals = await db
        .select()
        .from(modelEvaluations)
        .where(eq(modelEvaluations.modelGovernanceId, item.id))
        .orderBy(desc(modelEvaluations.evaluatedAt))
        .limit(3);

      const compliance = await db
        .select({
          framework: complianceControls.framework,
          controlCode: complianceControls.controlCode,
          status: modelComplianceMappings.status,
        })
        .from(modelComplianceMappings)
        .innerJoin(complianceControls, eq(modelComplianceMappings.controlId, complianceControls.id))
        .where(eq(modelComplianceMappings.modelGovernanceId, item.id));

      const complianceSummary = compliance.reduce((acc, c) => {
        acc[c.framework] = acc[c.framework] || { total: 0, compliant: 0 };
        acc[c.framework].total++;
        if (c.status === "compliant") acc[c.framework].compliant++;
        return acc;
      }, {} as Record<string, { total: number; compliant: number }>);

      return {
        ...item,
        latestEvaluations: evals,
        complianceSummary,
      };
    })
  );

  return NextResponse.json({ models: enriched });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const {
    modelId,
    displayName,
    description,
    providerId,
    riskLevel,
    businessLabels,
    allowedUseCases,
    bannedUseCases,
    dataClassesAllowed,
    licenseType,
    licenseUrl,
    provenanceVerified,
    biasReviewed,
    safetyReviewed,
    contextWindow,
    parameterScale,
    reasoningModes,
    costTier,
    sectorTags,
    ownerTeam,
    businessCriticality,
    allowedRegions,
    approvalStatus,
  } = body;

  if (!modelId || !displayName) {
    return NextResponse.json(
      { error: "modelId and displayName are required" },
      400
    );
  }

  const db = getDb();
  const [item] = await db
    .insert(modelGovernance)
    .values({
      modelId,
      displayName,
      description,
      providerId,
      riskLevel: riskLevel || "medium",
      businessLabels: businessLabels || [],
      allowedUseCases: allowedUseCases || [],
      bannedUseCases: bannedUseCases || [],
      dataClassesAllowed: dataClassesAllowed || ["public", "internal"],
      licenseType,
      licenseUrl,
      provenanceVerified: provenanceVerified || false,
      biasReviewed: biasReviewed || false,
      safetyReviewed: safetyReviewed || false,
      contextWindow,
      parameterScale,
      reasoningModes: reasoningModes || [],
      costTier: costTier || "standard",
      sectorTags: sectorTags || [],
      ownerTeam,
      businessCriticality: businessCriticality || "standard",
      allowedRegions: allowedRegions || ["uk", "eu"],
      approvalStatus: approvalStatus || "pending",
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "governance.model.created",
    entityType: "model_governance",
    entityId: item.id,
    metadata: { modelId, displayName, riskLevel },
  });

  return NextResponse.json({ model: item });
}
