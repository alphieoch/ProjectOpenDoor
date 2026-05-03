import { Hono } from "hono";
import {
  DuckDBAnalyticsClient,
  getUsageDaily,
  getUsageTotals,
  getLatencyPercentiles,
  getModelBreakdown,
  getCostBreakdown,
  exportQueryToBuffer,
  getExportContentType,
  getExportFileName,
  detectLatencyAnomalies,
  getComplianceReport,
  getApiKeyCohorts,
} from "@opendoor/analytics";
import type { ExportFormat } from "@opendoor/analytics";

const analyticsRouter = new Hono();

function parseDateRange(c: any): { days: number; since: Date; dateTo?: Date } {
  const days = parseInt(c.req.query("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const dateToParam = c.req.query("dateTo");
  const dateTo = dateToParam ? new Date(dateToParam) : undefined;
  return { days, since, dateTo };
}

// ── Enhanced Usage ──────────────────────────────────────────────────────────
analyticsRouter.get("/usage", async (c) => {
  const organization = c.get("organization");
  const { days, since, dateTo } = parseDateRange(c);

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return c.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();

    const [daily, totals, percentiles, modelBreakdown] = await Promise.all([
      getUsageDaily(client, {
        organizationId: organization.id,
        dateFrom: since,
        dateTo,
      }),
      getUsageTotals(client, {
        organizationId: organization.id,
        dateFrom: since,
        dateTo,
      }),
      getLatencyPercentiles(client, {
        organizationId: organization.id,
        dateFrom: since,
        dateTo,
      }),
      getModelBreakdown(client, {
        organizationId: organization.id,
        dateFrom: since,
        dateTo,
        limit: 50,
      }),
    ]);

    return c.json({
      days,
      daily,
      totals,
      percentiles,
      modelBreakdown,
    });
  } catch (err) {
    console.error("[Analytics] Usage query failed:", err);
    return c.json(
      { error: "Analytics query failed", detail: (err as Error).message },
      500
    );
  }
});

// ── Usage Export ────────────────────────────────────────────────────────────
analyticsRouter.get("/usage/export", async (c) => {
  const organization = c.get("organization");
  const { days, since, dateTo } = parseDateRange(c);
  const format = (c.req.query("format") || "csv") as ExportFormat;

  if (!["csv", "parquet", "json"].includes(format)) {
    return c.json({ error: "Invalid format. Use csv, parquet, or json" }, 400);
  }

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return c.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();

    const dateFilter = dateTo
      ? `pg.created_at >= '${since.toISOString()}' AND pg.created_at < '${dateTo.toISOString()}'`
      : `pg.created_at >= '${since.toISOString()}'`;

    const sql = `
      SELECT
        DATE(pg.created_at) AS date,
        pg.model_id AS model,
        pg.status,
        pg.latency_ms AS latency,
        pg.total_tokens AS tokens,
        pg.cost_usd AS cost
      FROM pg.requests pg
      WHERE pg.organization_id = '${organization.id}' AND ${dateFilter}
      ORDER BY pg.created_at DESC
    `;

    if (format === "json") {
      const rows = await client.query<Record<string, unknown>>(sql);
      return c.json(rows);
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
    console.error("[Analytics] Export failed:", err);
    return c.json(
      { error: "Export failed", detail: (err as Error).message },
      500
    );
  }
});

// ── Cost Breakdown ──────────────────────────────────────────────────────────
analyticsRouter.get("/billing/cost-breakdown", async (c) => {
  const organization = c.get("organization");
  const { since, dateTo } = parseDateRange(c);

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return c.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();

    const rows = await getCostBreakdown(client, {
      organizationId: organization.id,
      dateFrom: since,
      dateTo,
      limit: 100,
    });

    return c.json({ breakdown: rows });
  } catch (err) {
    console.error("[Analytics] Cost breakdown failed:", err);
    return c.json(
      { error: "Analytics query failed", detail: (err as Error).message },
      500
    );
  }
});

// ── Audit Logs Search ───────────────────────────────────────────────────────
analyticsRouter.get("/audit", async (c) => {
  const organization = c.get("organization");
  const search = c.req.query("search");
  const action = c.req.query("action");
  const limit = parseInt(c.req.query("limit") || "200", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return c.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();

    const { searchAuditLogs } = await import("@opendoor/analytics");
    const rows = await searchAuditLogs(client, {
      organizationId: organization.id,
      search,
      action,
      limit: Math.min(limit, 1000),
      offset,
    });

    return c.json({ logs: rows, limit, offset });
  } catch (err) {
    console.error("[Analytics] Audit search failed:", err);
    return c.json(
      { error: "Analytics query failed", detail: (err as Error).message },
      500
    );
  }
});

// ── Governance Violations ───────────────────────────────────────────────────
analyticsRouter.get("/governance/violations", async (c) => {
  const organization = c.get("organization");
  const { since, dateTo } = parseDateRange(c);

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return c.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();

    const { getViolationTrends } = await import("@opendoor/analytics");
    const rows = await getViolationTrends(client, {
      organizationId: organization.id,
      dateFrom: since,
      dateTo,
    });

    return c.json({ trends: rows });
  } catch (err) {
    console.error("[Analytics] Violation trends failed:", err);
    return c.json(
      { error: "Analytics query failed", detail: (err as Error).message },
      500
    );
  }
});

// ── Anomaly Detection ───────────────────────────────────────────────────────
analyticsRouter.get("/anomalies", async (c) => {
  const organization = c.get("organization");
  const { since, dateTo } = parseDateRange(c);

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return c.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();
    const rows = await detectLatencyAnomalies(client, {
      organizationId: organization.id,
      dateFrom: since,
      dateTo,
    });
    return c.json({ anomalies: rows });
  } catch (err) {
    console.error("[Analytics] Anomaly detection failed:", err);
    return c.json(
      { error: "Analytics query failed", detail: (err as Error).message },
      500
    );
  }
});

// ── Compliance Report ───────────────────────────────────────────────────────
analyticsRouter.get("/compliance", async (c) => {
  const organization = c.get("organization");

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return c.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();
    const rows = await getComplianceReport(client, {
      organizationId: organization.id,
    });
    return c.json({ report: rows });
  } catch (err) {
    console.error("[Analytics] Compliance report failed:", err);
    return c.json(
      { error: "Analytics query failed", detail: (err as Error).message },
      500
    );
  }
});

// ── Cohort Analysis ─────────────────────────────────────────────────────────
analyticsRouter.get("/cohorts", async (c) => {
  const organization = c.get("organization");

  const client = new DuckDBAnalyticsClient();
  if (!client.isEnabled()) {
    return c.json({ error: "DuckDB analytics not enabled" }, 503);
  }

  try {
    await client.init();
    const rows = await getApiKeyCohorts(client, {
      organizationId: organization.id,
    });
    return c.json({ cohorts: rows });
  } catch (err) {
    console.error("[Analytics] Cohort analysis failed:", err);
    return c.json(
      { error: "Analytics query failed", detail: (err as Error).message },
      500
    );
  }
});

export default analyticsRouter;
