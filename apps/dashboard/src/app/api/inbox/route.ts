import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { policyViolations, modelApprovals, modelGovernance, auditLogs } from "@opendoor/database";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const db = getDb();

  const [violations, approvals, logs] = await Promise.all([
    db
      .select({
        id: policyViolations.id,
        severity: policyViolations.severity,
        createdAt: policyViolations.createdAt,
      })
      .from(policyViolations)
      .where(and(eq(policyViolations.organizationId, orgId), isNull(policyViolations.resolvedAt)))
      .orderBy(desc(policyViolations.createdAt))
      .limit(8),
    db
      .select({
        id: modelApprovals.id,
        createdAt: modelApprovals.createdAt,
        modelName: modelGovernance.displayName,
        modelId: modelGovernance.modelId,
      })
      .from(modelApprovals)
      .innerJoin(modelGovernance, eq(modelApprovals.modelGovernanceId, modelGovernance.id))
      .where(and(eq(modelApprovals.organizationId, orgId), eq(modelApprovals.status, "pending")))
      .orderBy(desc(modelApprovals.createdAt))
      .limit(8),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, orgId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(6),
  ]);

  const items = [
    ...violations.map((v) => ({
      id: `v-${v.id}`,
      kind: "violation" as const,
      title: `Open ${v.severity} policy violation`,
      href: "/dashboard/governance/violations",
      at: v.createdAt,
    })),
    ...approvals.map((a) => ({
      id: `a-${a.id}`,
      kind: "approval" as const,
      title: `Pending approval · ${a.modelName || a.modelId}`,
      href: "/dashboard/governance/approvals",
      at: a.createdAt,
    })),
    ...logs.map((l) => ({
      id: `l-${l.id}`,
      kind: "audit" as const,
      title: l.action.replace(/\./g, " · "),
      href: "/dashboard/audit-logs",
      at: l.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);

  return NextResponse.json({
    items,
    unread: violations.length + approvals.length,
  });
}
