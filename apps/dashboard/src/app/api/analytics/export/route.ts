import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  DuckDBAnalyticsClient,
  exportQueryToBuffer,
  getExportContentType,
  getExportFileName,
} from "@opendoor/analytics";
import type { ExportFormat } from "@opendoor/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const format = (searchParams.get("format") || "csv") as ExportFormat;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  if (!["csv", "parquet", "json"].includes(format)) {
    return NextResponse.json(
      { error: "Invalid format. Use csv, parquet, or json" },
      400
    );
  }

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return NextResponse.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();

    const sql = `
      SELECT
        DATE(pg.created_at) AS date,
        pg.model_id AS model,
        pg.status,
        pg.latency_ms AS latency,
        pg.total_tokens AS tokens,
        pg.cost_usd AS cost
      FROM pg.requests pg
      WHERE pg.organization_id = '${orgId}' AND pg.created_at >= '${since.toISOString()}'
      ORDER BY pg.created_at DESC
    `;

    if (format === "json") {
      const rows = await client.query<Record<string, unknown>>(sql);
      return NextResponse.json(rows);
    }

    const data = await exportQueryToBuffer(client, sql, format);
    const fileName = getExportFileName("usage-export", format);

    return new Response(data, {
      headers: {
        "Content-Type": getExportContentType(format),
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("[DuckDB] Export failed:", err);
    return NextResponse.json(
      { error: "Export failed", detail: (err as Error).message },
      500
    );
  }
}
