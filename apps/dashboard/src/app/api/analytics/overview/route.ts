import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  DuckDBAnalyticsClient,
  getUsageTotals,
  getLatencyPercentiles,
  getModelBreakdown,
} from "@opendoor/analytics";
import { orgHasUnlimitedSpend } from "@/lib/credits";
import { loadUsageOverviewFromPostgres } from "@/lib/usage-postgres";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;

    const { searchParams } = new URL(req.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30", 10)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const unlimited = await orgHasUnlimitedSpend(orgId, { isSiteAdmin: session.isSiteAdmin });

    const client = new DuckDBAnalyticsClient();
    if (client.isEnabled()) {
      try {
        await client.init();
        const [totals, percentiles, modelBreakdown] = await Promise.all([
          getUsageTotals(client, { organizationId: orgId, dateFrom: since }),
          getLatencyPercentiles(client, { organizationId: orgId, dateFrom: since }),
          getModelBreakdown(client, { organizationId: orgId, dateFrom: since, limit: 10 }),
        ]);
        return NextResponse.json({
          days,
          engine: "duckdb",
          unlimited,
          unlimitedReason: unlimited ? (session.isSiteAdmin ? "site_admin" : "plan") : null,
          totals: {
            totalRequests: Number(totals.totalRequests || 0),
            totalTokens: Number(totals.totalTokens || 0),
            totalCost: Number((totals as { totalCost?: number }).totalCost || 0),
          },
          percentiles: {
            p50: Number(percentiles.p50 || 0),
            p95: Number(percentiles.p95 || (percentiles as { p90?: number }).p90 || 0),
            p99: Number(percentiles.p99 || 0),
          },
          topModels: modelBreakdown,
        });
      } catch (err) {
        console.error("[analytics] DuckDB overview failed, using Postgres:", err);
      }
    }

    const overview = await loadUsageOverviewFromPostgres(orgId, since);
    return NextResponse.json({
      days,
      engine: "postgres",
      unlimited,
      unlimitedReason: unlimited ? (session.isSiteAdmin ? "site_admin" : "plan") : null,
      ...overview,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load analytics";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
