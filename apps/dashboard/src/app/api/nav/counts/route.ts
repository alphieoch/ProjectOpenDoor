import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deployments, policyViolations, modelApprovals, workspaceAgents } from "@opendoor/database";
import { and, eq, isNull, sql } from "drizzle-orm";
import { governanceSession, unauthorized } from "@/lib/governance/http";

export async function GET() {
  const session = await governanceSession();
  if (!session) return unauthorized();
  const orgId = session.orgId;
  const db = getDb();

  const empty = { deployments: 0, openViolations: 0, pendingApprovals: 0, agents: 0 };

  try {
    const [dep, viol, appr, ag] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(deployments)
        .where(eq(deployments.organizationId, orgId))
        .catch(() => [{ count: 0 }]),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(policyViolations)
        .where(and(eq(policyViolations.organizationId, orgId), isNull(policyViolations.resolvedAt)))
        .catch(() => [{ count: 0 }]),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(modelApprovals)
        .where(and(eq(modelApprovals.organizationId, orgId), eq(modelApprovals.status, "pending")))
        .catch(() => [{ count: 0 }]),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(workspaceAgents)
        .where(and(eq(workspaceAgents.organizationId, orgId), eq(workspaceAgents.status, "running")))
        .catch(() => [{ count: 0 }]),
    ]);

    return NextResponse.json({
      deployments: Number(dep[0]?.count || 0),
      openViolations: Number(viol[0]?.count || 0),
      pendingApprovals: Number(appr[0]?.count || 0),
      agents: Number(ag[0]?.count || 0),
    });
  } catch {
    return NextResponse.json(empty);
  }
}
