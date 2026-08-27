import {
  auditLogs,
  creditTransactions,
  deployments,
  organizations,
  requests,
  trainingJobs,
  users,
  workflows,
  workspaceAgents,
} from "@opendoor/database";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fillDailySeries } from "@/lib/series";
import {
  gatewayInternalUrl,
  gatewayStatusCollidesWithApp,
} from "@/lib/public-urls";
import {
  asCount,
  countInStatuses,
  countsByKey,
  creditsCentsToUsd,
  sumRecord,
  type AdminOverview,
} from "./overview";

const EMPTY_TRAFFIC = { requests: 0, errors: 0, avgLatency: 0, cost: 0 };

async function probeGateway(): Promise<AdminOverview["health"]> {
  const gatewayUrl = gatewayInternalUrl();
  const urls = gatewayStatusCollidesWithApp(gatewayUrl)
    ? [`${gatewayUrl}/gateway/status`]
    : [`${gatewayUrl}/status`, `${gatewayUrl}/gateway/status`];
  const started = Date.now();

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) continue;
      const body = (await res.json()) as {
        status?: string;
        database?: { status?: string };
        redis?: { status?: string };
      };
      return {
        gatewayStatus: "up",
        gatewayLatencyMs: Date.now() - started,
        databaseStatus: (body.database?.status as AdminOverview["health"]["databaseStatus"]) || "unknown",
        redisStatus: (body.redis?.status as AdminOverview["health"]["redisStatus"]) || "unknown",
        walletUsd: 0,
        creditInflowUsd: 0,
        source: body.status || "gateway",
      };
    } catch {
      /* try next */
    }
  }

  try {
    const res = await fetch(`${gatewayUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    return {
      gatewayStatus: res.ok ? "up" : "down",
      gatewayLatencyMs: Date.now() - started,
      databaseStatus: "unknown",
      redisStatus: "unknown",
      walletUsd: 0,
      creditInflowUsd: 0,
      source: "gateway_health",
    };
  } catch {
    return {
      gatewayStatus: "down",
      gatewayLatencyMs: null,
      databaseStatus: "unknown",
      redisStatus: "unknown",
      walletUsd: 0,
      creditInflowUsd: 0,
      source: "gateway_unreachable",
    };
  }
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  const db = getDb();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const trafficSelect = {
    requests: sql<number>`COUNT(*)`,
    errors: sql<number>`COUNT(*) FILTER (WHERE ${requests.status} = 'error')`,
    avgLatency: sql<number>`COALESCE(AVG(${requests.latencyMs}), 0)`,
    cost: sql<number>`COALESCE(SUM(${requests.costUsd}), 0)`,
  };

  const [
    orgPlans,
    userStats,
    traffic7d,
    traffic24h,
    daily,
    agentRows,
    trainingRows,
    workflowRows,
    deploymentRows,
    wallet,
    creditIn,
    failureRows,
    auditRows,
    gateway,
  ] = await Promise.all([
    db
      .select({ key: organizations.plan, count: sql<number>`COUNT(*)` })
      .from(organizations)
      .groupBy(organizations.plan)
      .catch(() => []),
    db
      .select({
        total: sql<number>`COUNT(*)`,
        siteAdmins: sql<number>`COUNT(*) FILTER (WHERE ${users.isSiteAdmin})`,
      })
      .from(users)
      .catch(() => [{ total: 0, siteAdmins: 0 }]),
    db
      .select(trafficSelect)
      .from(requests)
      .where(gte(requests.createdAt, since7d))
      .catch(() => [EMPTY_TRAFFIC]),
    db
      .select(trafficSelect)
      .from(requests)
      .where(gte(requests.createdAt, since24h))
      .catch(() => [EMPTY_TRAFFIC]),
    db
      .select({
        day: sql<string>`(${requests.createdAt})::date`,
        requests: sql<number>`COUNT(*)`,
        errors: sql<number>`COUNT(*) FILTER (WHERE ${requests.status} = 'error')`,
      })
      .from(requests)
      .where(gte(requests.createdAt, since7d))
      .groupBy(sql`1`)
      .orderBy(sql`1`)
      .catch(() => []),
    db
      .select({ key: workspaceAgents.status, count: sql<number>`COUNT(*)` })
      .from(workspaceAgents)
      .where(isNull(workspaceAgents.deletedAt))
      .groupBy(workspaceAgents.status)
      .catch(() => []),
    db
      .select({ key: trainingJobs.status, count: sql<number>`COUNT(*)` })
      .from(trainingJobs)
      .groupBy(trainingJobs.status)
      .catch(() => []),
    db
      .select({ key: workflows.status, count: sql<number>`COUNT(*)` })
      .from(workflows)
      .groupBy(workflows.status)
      .catch(() => []),
    db
      .select({ key: deployments.status, count: sql<number>`COUNT(*)` })
      .from(deployments)
      .groupBy(deployments.status)
      .catch(() => []),
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${organizations.creditsUsdCents}), 0)`,
      })
      .from(organizations)
      .catch(() => [{ cents: 0 }]),
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${creditTransactions.amountCents}), 0)`,
      })
      .from(creditTransactions)
      .where(
        and(
          gte(creditTransactions.createdAt, since7d),
          sql`${creditTransactions.amountCents} > 0`,
        ),
      )
      .catch(() => [{ cents: 0 }]),
    db
      .select({
        id: requests.id,
        modelId: requests.modelId,
        errorMessage: requests.errorMessage,
        latencyMs: requests.latencyMs,
        createdAt: requests.createdAt,
        orgName: organizations.name,
      })
      .from(requests)
      .leftJoin(organizations, eq(organizations.id, requests.organizationId))
      .where(and(eq(requests.status, "error"), gte(requests.createdAt, since7d)))
      .orderBy(desc(requests.createdAt))
      .limit(8)
      .catch(() => []),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        createdAt: auditLogs.createdAt,
        orgName: organizations.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(organizations, eq(organizations.id, auditLogs.organizationId))
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(8)
      .catch(() => []),
    probeGateway().catch(() => ({
      gatewayStatus: "unknown" as const,
      gatewayLatencyMs: null,
      databaseStatus: "unknown" as const,
      redisStatus: "unknown" as const,
      walletUsd: 0,
      creditInflowUsd: 0,
      source: "probe_failed",
    })),
  ]);

  const orgsByPlan = countsByKey(orgPlans);
  const agentsByStatus = countsByKey(agentRows);
  const trainingByStatus = countsByKey(trainingRows);
  const workflowsByStatus = countsByKey(workflowRows);
  const deploymentsByStatus = countsByKey(deploymentRows);
  const t7 = traffic7d[0] || EMPTY_TRAFFIC;
  const t24 = traffic24h[0] || EMPTY_TRAFFIC;

  const posthogHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "").replace(/\/$/, "");
  const posthogUrl = posthogHost ? `${posthogHost.replace(/\/ingest$/, "")}` : null;

  return {
    traffic: {
      last24h: {
        requests: asCount(t24.requests),
        errors: asCount(t24.errors),
        avgLatencyMs: asCount(t24.avgLatency),
        costUsd: asCount(t24.cost),
      },
      last7d: {
        requests: asCount(t7.requests),
        errors: asCount(t7.errors),
        avgLatencyMs: asCount(t7.avgLatency),
        costUsd: asCount(t7.cost),
      },
      requestSeries: fillDailySeries(
        daily.map((d) => ({ day: d.day, value: asCount(d.requests) })),
        7,
      ),
      errorSeries: fillDailySeries(
        daily.map((d) => ({ day: d.day, value: asCount(d.errors) })),
        7,
      ),
    },
    programs: {
      orgs: sumRecord(orgsByPlan),
      orgsByPlan,
      users: asCount(userStats[0]?.total),
      siteAdmins: asCount(userStats[0]?.siteAdmins),
      agents: sumRecord(agentsByStatus),
      agentsRunning: countInStatuses(agentsByStatus, ["running", "busy", "online"]),
      trainingJobs: sumRecord(trainingByStatus),
      trainingActive: countInStatuses(trainingByStatus, ["queued", "running", "starting"]),
      workflows: sumRecord(workflowsByStatus),
      workflowsActive: countInStatuses(workflowsByStatus, ["active"]),
      deployments: sumRecord(deploymentsByStatus),
      deploymentsRunning: countInStatuses(deploymentsByStatus, ["running", "building"]),
    },
    health: {
      ...gateway,
      walletUsd: creditsCentsToUsd(wallet[0]?.cents),
      creditInflowUsd: creditsCentsToUsd(creditIn[0]?.cents),
    },
    recentFailures: failureRows.map((row) => ({
      id: row.id,
      modelId: row.modelId,
      errorMessage: row.errorMessage,
      latencyMs: asCount(row.latencyMs),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      orgName: row.orgName,
    })),
    recentAudit: auditRows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      orgName: row.orgName,
      userEmail: row.userEmail,
    })),
    posthogUrl,
  };
}
