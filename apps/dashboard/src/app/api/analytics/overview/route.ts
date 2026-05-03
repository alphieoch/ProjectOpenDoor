import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  DuckDBAnalyticsClient,
  getUsageTotals,
  getLatencyPercentiles,
  getModelBreakdown,
} from "@opendoor/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return NextResponse.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();

    const [totals, percentiles, modelBreakdown] = await Promise.all([
      getUsageTotals(client, {
        organizationId: orgId,
        dateFrom: since,
      }),
      getLatencyPercentiles(client, {
        organizationId: orgId,
        dateFrom: since,
      }),
      getModelBreakdown(client, {
        organizationId: orgId,
        dateFrom: since,
        limit: 10,
      }),
    ]);

    return NextResponse.json({
      days,
      totals,
      percentiles,
      topModels: modelBreakdown,
    });
  } catch (err) {
    console.error("[DuckDB] Overview analytics failed:", err);
    return NextResponse.json(
      { error: "Analytics query failed", detail: (err as Error).message },
      500
    );
  }
}
