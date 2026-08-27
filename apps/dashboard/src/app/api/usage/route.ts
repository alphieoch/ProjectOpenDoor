import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requests } from "@opendoor/database";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { DuckDBAnalyticsClient, getUsageDaily } from "@opendoor/analytics";
import { orgHasUnlimitedSpend } from "@/lib/credits";
import { loadUsageOverviewFromPostgres } from "@/lib/usage-postgres";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    const { searchParams } = new URL(req.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30", 10)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const unlimited = await orgHasUnlimitedSpend(orgId, { isSiteAdmin: session.isSiteAdmin });

    let daily: Array<Record<string, unknown>> | null = null;
    let engine = "postgres";

    if (days > 7) {
      const client = new DuckDBAnalyticsClient();
      if (client.isEnabled()) {
        try {
          await client.init();
          daily = await getUsageDaily(client, {
            organizationId: orgId,
            dateFrom: since,
          });
          engine = "duckdb";
        } catch (err) {
          console.error("[DuckDB] Dashboard usage failed, falling back:", err);
        }
      }
    }

    if (!daily) {
      const db = getDb();
      daily = await db
        .select({
          date: sql<string>`DATE(${requests.createdAt})`,
          requests: sql<number>`COUNT(*)`,
          promptTokens: sql<number>`SUM(${requests.promptTokens})`,
          completionTokens: sql<number>`SUM(${requests.completionTokens})`,
          totalTokens: sql<number>`SUM(${requests.totalTokens})`,
          costUsd: sql<number>`SUM(${requests.costUsd})`,
          successCount: sql<number>`SUM(CASE WHEN ${requests.status} = 'success' THEN 1 ELSE 0 END)`,
          errorCount: sql<number>`SUM(CASE WHEN ${requests.status} = 'error' THEN 1 ELSE 0 END)`,
          cachedCount: sql<number>`SUM(CASE WHEN ${requests.status} = 'cached' THEN 1 ELSE 0 END)`,
        })
        .from(requests)
        .where(and(eq(requests.organizationId, orgId), gte(requests.createdAt, since)))
        .groupBy(sql`DATE(${requests.createdAt})`)
        .orderBy(sql`DATE(${requests.createdAt})`);
    }

    const overview = await loadUsageOverviewFromPostgres(orgId, since);

    return NextResponse.json({
      daily,
      engine,
      unlimited,
      unlimitedReason: unlimited ? (session.isSiteAdmin ? "site_admin" : "plan") : null,
      overview,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load usage";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
