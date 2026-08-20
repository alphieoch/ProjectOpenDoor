import { providers, requests } from "@opendoor/database";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export type UsageOverview = {
  totals: { totalRequests: number; totalTokens: number; totalCost: number };
  percentiles: { p50: number; p95: number; p99: number };
  topModels: Array<{
    modelId: string;
    providerName: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    avgLatencyMs: number;
  }>;
};

export async function loadUsageOverviewFromPostgres(
  orgId: string,
  since: Date,
  limit = 10,
): Promise<UsageOverview> {
  const db = getDb();

  const [totalsRow] = await db
    .select({
      totalRequests: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`COALESCE(SUM(${requests.totalTokens}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${requests.costUsd}), 0)`,
    })
    .from(requests)
    .where(and(eq(requests.organizationId, orgId), gte(requests.createdAt, since)));

  let percentiles = { p50: 0, p95: 0, p99: 0 };
  try {
    const [pct] = await db
      .select({
        p50: sql<number>`COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY ${requests.latencyMs}), 0)`,
        p95: sql<number>`COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${requests.latencyMs}), 0)`,
        p99: sql<number>`COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY ${requests.latencyMs}), 0)`,
      })
      .from(requests)
      .where(
        and(
          eq(requests.organizationId, orgId),
          gte(requests.createdAt, since),
          sql`${requests.latencyMs} > 0`,
        ),
      );
    percentiles = {
      p50: Number(pct?.p50 || 0),
      p95: Number(pct?.p95 || 0),
      p99: Number(pct?.p99 || 0),
    };
  } catch {
    const [avg] = await db
      .select({
        avg: sql<number>`COALESCE(AVG(${requests.latencyMs}), 0)`,
      })
      .from(requests)
      .where(
        and(
          eq(requests.organizationId, orgId),
          gte(requests.createdAt, since),
          sql`${requests.latencyMs} > 0`,
        ),
      );
    const fallback = Number(avg?.avg || 0);
    percentiles = { p50: fallback, p95: fallback, p99: fallback };
  }

  const topModels = await db
    .select({
      modelId: requests.modelId,
      providerName: providers.name,
      requests: sql<number>`COUNT(*)`,
      promptTokens: sql<number>`COALESCE(SUM(${requests.promptTokens}), 0)`,
      completionTokens: sql<number>`COALESCE(SUM(${requests.completionTokens}), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(${requests.totalTokens}), 0)`,
      costUsd: sql<number>`COALESCE(SUM(${requests.costUsd}), 0)`,
      avgLatencyMs: sql<number>`COALESCE(AVG(${requests.latencyMs}), 0)`,
    })
    .from(requests)
    .leftJoin(providers, eq(requests.providerId, providers.id))
    .where(and(eq(requests.organizationId, orgId), gte(requests.createdAt, since)))
    .groupBy(requests.modelId, providers.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);

  return {
    totals: {
      totalRequests: Number(totalsRow?.totalRequests || 0),
      totalTokens: Number(totalsRow?.totalTokens || 0),
      totalCost: Number(totalsRow?.totalCost || 0),
    },
    percentiles,
    topModels: topModels.map((row) => ({
      modelId: row.modelId,
      providerName: row.providerName || "unknown",
      requests: Number(row.requests || 0),
      promptTokens: Number(row.promptTokens || 0),
      completionTokens: Number(row.completionTokens || 0),
      totalTokens: Number(row.totalTokens || 0),
      costUsd: Number(row.costUsd || 0),
      avgLatencyMs: Number(row.avgLatencyMs || 0),
    })),
  };
}
