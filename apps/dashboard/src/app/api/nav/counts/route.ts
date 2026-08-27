import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deployments, policyViolations, modelApprovals, workspaceAgents } from "@opendoor/database";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET() {
  const empty = { deployments: 0, openViolations: 0, pendingApprovals: 0, agents: 0 };
  const session = await getSession();
  if (!session) return NextResponse.json(empty);

  const orgId = session.orgId as string;
  if (!orgId) return NextResponse.json(empty);

  try {
    const db = getDb();
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
        .where(and(eq(workspaceAgents.organizationId, orgId), eq(workspaceAgents.status, "running"), isNull(workspaceAgents.deletedAt)))
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
