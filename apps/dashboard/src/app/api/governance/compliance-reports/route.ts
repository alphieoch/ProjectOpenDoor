import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { complianceReports, modelGovernance, complianceRules, modelEvaluations, modelComplianceMappings, complianceControls } from "@opendoor/database";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    const db = getDb();
    const reports = await db
      .select()
      .from(complianceReports)
      .where(eq(complianceReports.organizationId, orgId))
      .orderBy(desc(complianceReports.generatedAt));

    return NextResponse.json({ reports });
  } catch (error: any) {
    console.error("Compliance reports fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch compliance reports" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const userId = session.sub as string;

    const { modelGovernanceId, framework } = await req.json();
    if (!modelGovernanceId) {
      return NextResponse.json({ error: "modelGovernanceId is required" }, { status: 400 });
    }

    const db = getDb();

    // Get model
    const model = await db.query.modelGovernance.findFirst({
      where: eq(modelGovernance.id, modelGovernanceId),
    });
    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Get rules
    const rulesQuery = db
      .select()
      .from(complianceRules)
      .where(
        and(
          eq(complianceRules.organizationId, orgId),
          eq(complianceRules.enabled, true)
        )
      );
    const rules = framework
      ? rulesQuery.then((r) => r.filter((rule) => rule.framework === framework))
      : rulesQuery;
    const allRules = await rules;

    // Get evaluations
    const evaluations = await db
      .select()
      .from(modelEvaluations)
      .where(eq(modelEvaluations.modelGovernanceId, modelGovernanceId));

    // Get compliance mappings
    const mappings = await db
      .select()
      .from(modelComplianceMappings)
      .innerJoin(complianceControls, eq(modelComplianceMappings.controlId, complianceControls.id))
      .where(eq(modelComplianceMappings.modelGovernanceId, modelGovernanceId));

    // Run checks
    const findings: any[] = [];
    const recommendations: any[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let warningCount = 0;

    for (const rule of allRules) {
      const config = (rule.ruleConfig || {}) as Record<string, any>;
      let status: "passed" | "failed" | "warning" = "passed";
      let detail = "";

      if (rule.ruleType === "model_attribute") {
        const attr = config.attribute as string;
        const value = (model as any)[attr];

        if (config.operator === "eq") {
          if (value !== config.expected) {
            status = rule.severity === "critical" ? "failed" : "warning";
            detail = config.message || `Expected ${attr} to be "${config.expected}", got "${value}"`;
          }
        } else if (config.operator === "neq") {
          if (value === config.expected) {
            status = rule.severity === "critical" ? "failed" : "warning";
            detail = config.message || `${attr} should not be "${config.expected}"`;
          }
        } else if (config.operator === "contains") {
          const arr = Array.isArray(value) ? value : [];
          const expectedArr = Array.isArray(config.expected) ? config.expected : [config.expected];
          const missing = expectedArr.filter((e: string) => !arr.includes(e));
          if (missing.length > 0) {
            status = rule.severity === "critical" ? "failed" : "warning";
            detail = `Missing required values in ${attr}: ${missing.join(", ")}`;
          }
        }
      } else if (rule.ruleType === "evaluation_score") {
        const evalType = config.evaluationType as string;
        const minScore = parseFloat(config.minScore);
        const evalRecord = evaluations.find((e) => e.evaluationType === evalType);

        if (!evalRecord) {
          status = "warning";
          detail = `No ${evalType} evaluation found for this model.`;
        } else {
          const score = parseFloat(evalRecord.score as string);
          if (score < minScore) {
            status = rule.severity === "critical" ? "failed" : "warning";
            detail = `${evalType} score ${score}% is below threshold ${minScore}%.`;
          } else {
            detail = `${evalType} score ${score}% meets threshold ${minScore}%.`;
          }
        }
      }

      if (status === "passed") passedCount++;
      else if (status === "failed") failedCount++;
      else warningCount++;

      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        framework: rule.framework,
        controlCode: rule.controlCode,
        severity: rule.severity,
        status,
        detail,
      });

      if (status !== "passed" && rule.recommendation) {
        recommendations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          framework: rule.framework,
          severity: rule.severity,
          recommendation: rule.recommendation,
          referenceUrl: rule.referenceUrl,
          referenceName: rule.referenceName,
        });
      }
    }

    const total = findings.length;
    const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;

    // Build status summary
    const frameworkBreakdown: Record<string, { passed: number; failed: number; warning: number; total: number }> = {};
    for (const f of findings) {
      const fw = f.framework || "other";
      if (!frameworkBreakdown[fw]) frameworkBreakdown[fw] = { passed: 0, failed: 0, warning: 0, total: 0 };
      frameworkBreakdown[fw].total++;
      frameworkBreakdown[fw][f.status]++;
    }

    // Insert report
    const [report] = await db
      .insert(complianceReports)
      .values({
        organizationId: orgId,
        modelGovernanceId,
        title: `Compliance Report: ${model.displayName}`,
        description: `Automated compliance assessment for ${model.displayName} against ${total} rules.`,
        framework: framework || null,
        statusSummary: {
          total,
          passed: passedCount,
          failed: failedCount,
          warning: warningCount,
          score,
          frameworks: frameworkBreakdown,
        },
        findings,
        recommendations,
        score,
        passed: failedCount === 0,
        generatedBy: userId,
      })
      .returning();

    await logAuditEvent({
      organizationId: orgId,
      userId,
      action: "governance.compliance.report.generated",
      entityType: "compliance_report",
      entityId: report.id,
      metadata: { modelGovernanceId, framework, score, passed: failedCount === 0 },
    });

    return NextResponse.json({ report });
  } catch (error: any) {
    console.error("Compliance report generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate compliance report" },
      { status: 500 }
    );
  }
}
