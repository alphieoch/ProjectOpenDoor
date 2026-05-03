import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  modelGovernance,
  modelEvaluations,
  modelComplianceMappings,
  complianceControls,
  policyViolations,
  modelApprovals,
  users,
} from "@opendoor/database";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();

  // Fetch all governance models
  const models = await db
    .select({
      id: modelGovernance.id,
      modelId: modelGovernance.modelId,
      displayName: modelGovernance.displayName,
      description: modelGovernance.description,
      approvalStatus: modelGovernance.approvalStatus,
      riskLevel: modelGovernance.riskLevel,
      businessLabels: modelGovernance.businessLabels,
      allowedUseCases: modelGovernance.allowedUseCases,
      bannedUseCases: modelGovernance.bannedUseCases,
      dataClassesAllowed: modelGovernance.dataClassesAllowed,
      licenseType: modelGovernance.licenseType,
      provenanceVerified: modelGovernance.provenanceVerified,
      biasReviewed: modelGovernance.biasReviewed,
      safetyReviewed: modelGovernance.safetyReviewed,
      contextWindow: modelGovernance.contextWindow,
      parameterScale: modelGovernance.parameterScale,
      costTier: modelGovernance.costTier,
      sectorTags: modelGovernance.sectorTags,
      ownerTeam: modelGovernance.ownerTeam,
      businessCriticality: modelGovernance.businessCriticality,
      allowedRegions: modelGovernance.allowedRegions,
      lastReviewedBy: modelGovernance.lastReviewedBy,
      lastReviewedAt: modelGovernance.lastReviewedAt,
      updatedAt: modelGovernance.updatedAt,
    })
    .from(modelGovernance)
    .orderBy(desc(modelGovernance.updatedAt));

  // Enrich with evaluations, compliance, and recent violations
  const enriched = await Promise.all(
    models.map(async (model) => {
      const [evals, compliance, recentViolations, pendingApproval, reviewer] = await Promise.all([
        db
          .select()
          .from(modelEvaluations)
          .where(eq(modelEvaluations.modelGovernanceId, model.id))
          .orderBy(desc(modelEvaluations.evaluatedAt))
          .limit(3),
        db
          .select({
            framework: complianceControls.framework,
            controlCode: complianceControls.controlCode,
            controlName: complianceControls.controlName,
            status: modelComplianceMappings.status,
            evidence: modelComplianceMappings.evidence,
          })
          .from(modelComplianceMappings)
          .innerJoin(complianceControls, eq(modelComplianceMappings.controlId, complianceControls.id))
          .where(eq(modelComplianceMappings.modelGovernanceId, model.id)),
        db
          .select()
          .from(policyViolations)
          .where(eq(policyViolations.modelId, model.modelId))
          .orderBy(desc(policyViolations.createdAt))
          .limit(5),
        db
          .select()
          .from(modelApprovals)
          .where(
            and(
              eq(modelApprovals.modelGovernanceId, model.id),
              eq(modelApprovals.organizationId, orgId),
              eq(modelApprovals.status, "pending")
            )
          )
          .limit(1),
        model.lastReviewedBy
          ? db.select({ name: users.name }).from(users).where(eq(users.id, model.lastReviewedBy)).limit(1)
          : Promise.resolve([]),
      ]);

      const complianceSummary = compliance.reduce((acc, c) => {
        acc[c.framework] = acc[c.framework] || { total: 0, compliant: 0, partial: 0, nonCompliant: 0 };
        acc[c.framework].total++;
        if (c.status === "compliant") acc[c.framework].compliant++;
        if (c.status === "partial") acc[c.framework].partial++;
        if (c.status === "non_compliant") acc[c.framework].nonCompliant++;
        return acc;
      }, {} as Record<string, { total: number; compliant: number; partial: number; nonCompliant: number }>);

      return {
        ...model,
        latestEvaluations: evals,
        compliance,
        complianceSummary,
        recentViolations,
        pendingApproval: pendingApproval[0] || null,
        lastReviewedByName: reviewer[0]?.name || null,
      };
    })
  );

  return NextResponse.json({ models: enriched });
}
