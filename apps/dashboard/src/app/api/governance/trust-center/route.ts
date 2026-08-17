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
import { eq, desc, and, inArray } from "drizzle-orm";
import { emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET() {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;

  try {
    const db = getDb();

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

    if (models.length === 0) {
      return NextResponse.json({ models: [] });
    }

    const ids = models.map((m) => m.id);
    const modelIds = models.map((m) => m.modelId);
    const reviewerIds = [...new Set(models.map((m) => m.lastReviewedBy).filter(Boolean))] as string[];

    const [evals, compliance, violations, pending, reviewers] = await Promise.all([
      db
        .select()
        .from(modelEvaluations)
        .where(inArray(modelEvaluations.modelGovernanceId, ids))
        .orderBy(desc(modelEvaluations.evaluatedAt)),
      db
        .select({
          modelGovernanceId: modelComplianceMappings.modelGovernanceId,
          framework: complianceControls.framework,
          controlCode: complianceControls.controlCode,
          controlName: complianceControls.controlName,
          status: modelComplianceMappings.status,
          evidence: modelComplianceMappings.evidence,
        })
        .from(modelComplianceMappings)
        .innerJoin(complianceControls, eq(modelComplianceMappings.controlId, complianceControls.id))
        .where(inArray(modelComplianceMappings.modelGovernanceId, ids)),
      db
        .select()
        .from(policyViolations)
        .where(inArray(policyViolations.modelId, modelIds))
        .orderBy(desc(policyViolations.createdAt)),
      db
        .select()
        .from(modelApprovals)
        .where(
          and(
            inArray(modelApprovals.modelGovernanceId, ids),
            eq(modelApprovals.organizationId, orgId),
            eq(modelApprovals.status, "pending"),
          ),
        ),
      reviewerIds.length
        ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, reviewerIds))
        : Promise.resolve([]),
    ]);

    const evalsByModel = new Map<string, typeof evals>();
    for (const row of evals) {
      const list = evalsByModel.get(row.modelGovernanceId) ?? [];
      if (list.length < 3) list.push(row);
      evalsByModel.set(row.modelGovernanceId, list);
    }

    const complianceByModel = new Map<string, typeof compliance>();
    for (const row of compliance) {
      const list = complianceByModel.get(row.modelGovernanceId) ?? [];
      list.push(row);
      complianceByModel.set(row.modelGovernanceId, list);
    }

    const violationsByModel = new Map<string, typeof violations>();
    for (const row of violations) {
      const list = violationsByModel.get(row.modelId) ?? [];
      if (list.length < 5) list.push(row);
      violationsByModel.set(row.modelId, list);
    }

    const pendingByModel = new Map(pending.map((row) => [row.modelGovernanceId, row]));
    const reviewerName = new Map(reviewers.map((row) => [row.id, row.name]));

    const enriched = models.map((model) => {
      const modelCompliance = complianceByModel.get(model.id) ?? [];
      const complianceSummary = modelCompliance.reduce((acc, c) => {
        acc[c.framework] = acc[c.framework] || { total: 0, compliant: 0, partial: 0, nonCompliant: 0 };
        acc[c.framework].total++;
        if (c.status === "compliant") acc[c.framework].compliant++;
        if (c.status === "partial") acc[c.framework].partial++;
        if (c.status === "non_compliant") acc[c.framework].nonCompliant++;
        return acc;
      }, {} as Record<string, { total: number; compliant: number; partial: number; nonCompliant: number }>);

      return {
        ...model,
        latestEvaluations: evalsByModel.get(model.id) ?? [],
        compliance: modelCompliance,
        complianceSummary,
        recentViolations: violationsByModel.get(model.modelId) ?? [],
        pendingApproval: pendingByModel.get(model.id) || null,
        lastReviewedByName: model.lastReviewedBy ? reviewerName.get(model.lastReviewedBy) || null : null,
      };
    });

    return NextResponse.json({ models: enriched });
  } catch (err) {
    return NextResponse.json(emptyOnMissingTable({ models: [] }, err));
  }
}
