import type { DuckDBAnalyticsClient } from "./client.js";
import type {
  UsageDailyRow,
  UsageTotals,
  LatencyPercentiles,
  ModelBreakdownRow,
  CostBreakdownRow,
  AuditLogRow,
  ViolationTrendRow,
  AnalyticsQueryOptions,
} from "./types.js";

function buildWhere(
  options: AnalyticsQueryOptions,
  alias = "pg"
): { clause: string; params: string[] } {
  const conditions: string[] = [`${alias}.organization_id = '${options.organizationId}'`];
  const params: string[] = [];

  if (options.dateFrom) {
    conditions.push(`${alias}.created_at >= '${options.dateFrom.toISOString()}'`);
  }
  if (options.dateTo) {
    conditions.push(`${alias}.created_at < '${options.dateTo.toISOString()}'`);
  }

  return { clause: conditions.join(" AND "), params };
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage Analytics
// ─────────────────────────────────────────────────────────────────────────────

export async function getUsageDaily(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions
): Promise<UsageDailyRow[]> {
  const { clause } = buildWhere(options, "pg");
  const sql = `
    SELECT
      DATE(pg.created_at) AS date,
      COUNT(*)::INTEGER AS requests,
      SUM(pg.prompt_tokens)::INTEGER AS promptTokens,
      SUM(pg.completion_tokens)::INTEGER AS completionTokens,
      SUM(pg.total_tokens)::INTEGER AS totalTokens,
      ROUND(SUM(pg.cost_usd), 8) AS costUsd
    FROM pg.requests pg
    WHERE ${clause}
    GROUP BY DATE(pg.created_at)
    ORDER BY DATE(pg.created_at)
    ${options.limit ? `LIMIT ${options.limit}` : ""}
    ${options.offset ? `OFFSET ${options.offset}` : ""}
  `;
  return client.query<UsageDailyRow>(sql);
}

export async function getUsageTotals(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions
): Promise<UsageTotals> {
  const { clause } = buildWhere(options, "pg");
  const sql = `
    SELECT
      COUNT(*)::INTEGER AS totalRequests,
      SUM(pg.total_tokens)::INTEGER AS totalTokens,
      ROUND(SUM(pg.cost_usd), 8) AS totalCost
    FROM pg.requests pg
    WHERE ${clause}
  `;
  const row = await client.querySingle<UsageTotals>(sql);
  return row ?? { totalRequests: 0, totalTokens: 0, totalCost: 0 };
}

export async function getLatencyPercentiles(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions
): Promise<LatencyPercentiles> {
  const { clause } = buildWhere(options, "pg");
  const sql = `
    SELECT
      percentile_cont(0.50) WITHIN GROUP (ORDER BY pg.latency_ms)::INTEGER AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY pg.latency_ms)::INTEGER AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY pg.latency_ms)::INTEGER AS p99
    FROM pg.requests pg
    WHERE ${clause}
  `;
  const row = await client.querySingle<LatencyPercentiles>(sql);
  return row ?? { p50: 0, p95: 0, p99: 0 };
}

export async function getModelBreakdown(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions
): Promise<ModelBreakdownRow[]> {
  const { clause } = buildWhere(options, "pg");
  const sql = `
    SELECT
      pg.model_id AS modelId,
      COALESCE(p.name, 'unknown') AS providerName,
      COUNT(*)::INTEGER AS requests,
      SUM(pg.total_tokens)::INTEGER AS totalTokens,
      ROUND(SUM(pg.cost_usd), 8) AS costUsd,
      ROUND(AVG(pg.latency_ms), 2)::INTEGER AS avgLatencyMs
    FROM pg.requests pg
    LEFT JOIN pg.providers p ON pg.provider_id = p.id
    WHERE ${clause}
    GROUP BY pg.model_id, p.name
    ORDER BY requests DESC
    ${options.limit ? `LIMIT ${options.limit}` : ""}
  `;
  return client.query<ModelBreakdownRow>(sql);
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing / Cost Analytics
// ─────────────────────────────────────────────────────────────────────────────

export async function getCostBreakdown(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions
): Promise<CostBreakdownRow[]> {
  const { clause } = buildWhere(options, "pg");
  const sql = `
    SELECT
      COALESCE(p.name, 'unknown') AS providerName,
      pg.model_id AS modelId,
      COALESCE(pg.region, 'unknown') AS region,
      COUNT(*)::INTEGER AS requests,
      ROUND(SUM(pg.cost_usd), 8) AS totalCost,
      COALESCE(
        (SELECT AVG(pr.markup_percent)
         FROM pg.pricing_rules pr
         WHERE pr.provider_id = pg.provider_id AND pr.model_id = pg.model_id),
        0
      )::FLOAT AS markupPercent
    FROM pg.requests pg
    LEFT JOIN pg.providers p ON pg.provider_id = p.id
    WHERE ${clause}
    GROUP BY p.name, pg.model_id, pg.region
    ORDER BY totalCost DESC
    ${options.limit ? `LIMIT ${options.limit}` : ""}
  `;
  return client.query<CostBreakdownRow>(sql);
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Logs
// ─────────────────────────────────────────────────────────────────────────────

export async function searchAuditLogs(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions & { search?: string; action?: string }
): Promise<AuditLogRow[]> {
  const { clause } = buildWhere(options, "pg");
  let where = clause;

  if (options.search) {
    const s = options.search.replace(/'/g, "''");
    where += ` AND (
      pg.action ILIKE '%${s}%' OR
      pg.entity_type ILIKE '%${s}%' OR
      pg.metadata::TEXT ILIKE '%${s}%'
    )`;
  }

  if (options.action) {
    where += ` AND pg.action = '${options.action}'`;
  }

  const sql = `
    SELECT
      pg.id,
      pg.organization_id AS organizationId,
      pg.action,
      pg.entity_type AS entityType,
      pg.entity_id AS entityId,
      pg.metadata,
      pg.ip_address AS ipAddress,
      pg.created_at AS createdAt,
      u.name AS userName,
      u.email AS userEmail,
      o.name AS orgName
    FROM pg.audit_logs pg
    LEFT JOIN pg.users u ON pg.user_id = u.id
    LEFT JOIN pg.organizations o ON pg.organization_id = o.id
    WHERE ${where}
    ORDER BY pg.created_at DESC
    ${options.limit ? `LIMIT ${options.limit}` : ""}
    ${options.offset ? `OFFSET ${options.offset}` : ""}
  `;
  return client.query<AuditLogRow>(sql);
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance / Violations
// ─────────────────────────────────────────────────────────────────────────────

export async function getViolationTrends(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions
): Promise<ViolationTrendRow[]> {
  const { clause } = buildWhere(options, "pg");
  const sql = `
    SELECT
      DATE(pg.created_at) AS date,
      pg.violation_type AS violationType,
      pg.severity,
      COUNT(*)::INTEGER AS count
    FROM pg.policy_violations pg
    WHERE ${clause}
    GROUP BY DATE(pg.created_at), pg.violation_type, pg.severity
    ORDER BY date DESC, count DESC
  `;
  return client.query<ViolationTrendRow>(sql);
}
