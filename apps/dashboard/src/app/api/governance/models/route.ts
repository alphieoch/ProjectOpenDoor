import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelGovernance, modelEvaluations, modelComplianceMappings, complianceControls } from "@opendoor/database";
import { eq, desc, inArray } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { orgActorId } from "@/lib/governance/actor";
import { badRequest, emptyOnMissingTable, governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();

  try {
    const lite = new URL(req.url).searchParams.get("lite") === "1";
    const db = getDb();
    const items = await db.query.modelGovernance.findMany({
      orderBy: [desc(modelGovernance.updatedAt)],
    });

    if (items.length === 0) {
      return NextResponse.json({ models: [] });
    }

    if (lite) {
      return NextResponse.json({ models: items });
    }

    const ids = items.map((item) => item.id);
    const [evals, compliance] = await Promise.all([
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
          status: modelComplianceMappings.status,
        })
        .from(modelComplianceMappings)
        .innerJoin(complianceControls, eq(modelComplianceMappings.controlId, complianceControls.id))
        .where(inArray(modelComplianceMappings.modelGovernanceId, ids)),
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

    const enriched = items.map((item) => {
      const rows = complianceByModel.get(item.id) ?? [];
      const complianceSummary = rows.reduce((acc, c) => {
        acc[c.framework] = acc[c.framework] || { total: 0, compliant: 0 };
        acc[c.framework].total++;
        if (c.status === "compliant") acc[c.framework].compliant++;
        return acc;
      }, {} as Record<string, { total: number; compliant: number }>);

      return {
        ...item,
        latestEvaluations: evalsByModel.get(item.id) ?? [],
        complianceSummary,
      };
    });

    return NextResponse.json({ models: enriched });
  } catch (err) {
    return NextResponse.json(emptyOnMissingTable({ models: [] }, err));
  }
}

export async function POST(req: NextRequest) {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;
  const body = await req.json();
  const actorId = await orgActorId(session);

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
    return badRequest("modelId and displayName are required");
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
    userId: actorId ?? undefined,
    action: "governance.model.created",
    entityType: "model_governance",
    entityId: item.id,
    metadata: { modelId, displayName, riskLevel },
  });

  return NextResponse.json({ model: item });
}
