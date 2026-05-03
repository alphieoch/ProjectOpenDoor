import type { DuckDBAnalyticsClient } from "./client.js";
import type { AnalyticsQueryOptions } from "./types.js";

export interface AnomalyRow {
  date: string;
  requests: number;
  avgLatency: number;
  stddevLatency: number;
  isAnomaly: boolean;
  zScore: number;
}

export interface ComplianceReportRow {
  modelId: string;
  displayName: string;
  riskLevel: string;
  approvalStatus: string;
  frameworks: string;
  compliantControls: number;
  partialControls: number;
  nonCompliantControls: number;
}

export interface CohortRow {
  cohortMonth: string;
  apiKeys: number;
  active30d: number;
  active60d: number;
  active90d: number;
}

// ── Anomaly Detection ───────────────────────────────────────────────────────

export async function detectLatencyAnomalies(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions
): Promise<AnomalyRow[]> {
  const { clause } = buildWhere(options, "pg");
  const sql = `
    WITH daily_stats AS (
      SELECT
        DATE(pg.created_at) AS date,
        COUNT(*)::INTEGER AS requests,
        AVG(pg.latency_ms)::FLOAT AS avgLatency,
        STDDEV_SAMP(pg.latency_ms)::FLOAT AS stddevLatency
      FROM pg.requests pg
      WHERE ${clause}
      GROUP BY DATE(pg.created_at)
    ),
    stats AS (
      SELECT
        AVG(avgLatency) AS mean_lat,
        STDDEV_SAMP(avgLatency) AS stddev_lat
      FROM daily_stats
    )
    SELECT
      ds.date,
      ds.requests,
      ROUND(ds.avgLatency, 2) AS avgLatency,
      ROUND(COALESCE(ds.stddevLatency, 0), 2) AS stddevLatency,
      ABS(ds.avgLatency - s.mean_lat) > 2 * COALESCE(s.stddev_lat, 0) AS isAnomaly,
      ROUND((ds.avgLatency - s.mean_lat) / NULLIF(s.stddev_lat, 0), 2) AS zScore
    FROM daily_stats ds
    CROSS JOIN stats s
    ORDER BY ds.date DESC
  `;
  return client.query<AnomalyRow>(sql);
}

// ── Compliance Reporting ────────────────────────────────────────────────────

export async function getComplianceReport(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions
): Promise<ComplianceReportRow[]> {
  const sql = `
    SELECT
      mg.model_id AS modelId,
      mg.display_name AS displayName,
      mg.risk_level AS riskLevel,
      mg.approval_status AS approvalStatus,
      STRING_AGG(DISTINCT cc.framework, ', ') AS frameworks,
      COUNT(CASE WHEN mcm.status = 'compliant' THEN 1 END)::INTEGER AS compliantControls,
      COUNT(CASE WHEN mcm.status = 'partial' THEN 1 END)::INTEGER AS partialControls,
      COUNT(CASE WHEN mcm.status = 'non_compliant' THEN 1 END)::INTEGER AS nonCompliantControls
    FROM pg.model_governance mg
    LEFT JOIN pg.model_compliance_mappings mcm ON mg.id = mcm.model_governance_id
    LEFT JOIN pg.compliance_controls cc ON mcm.control_id = cc.id
    WHERE mg.organization_id = '${options.organizationId}' OR mg.organization_id IS NULL
    GROUP BY mg.id, mg.model_id, mg.display_name, mg.risk_level, mg.approval_status
    ORDER BY mg.display_name
  `;
  return client.query<ComplianceReportRow>(sql);
}

// ── Cohort Analysis ─────────────────────────────────────────────────────────

export async function getApiKeyCohorts(
  client: DuckDBAnalyticsClient,
  options: AnalyticsQueryOptions
): Promise<CohortRow[]> {
  const sql = `
    WITH cohorts AS (
      SELECT
        DATE_TRUNC('month', created_at)::DATE AS cohort_month,
        id AS api_key_id
      FROM pg.api_keys
      WHERE organization_id = '${options.organizationId}'
    ),
    activity AS (
      SELECT
        c.cohort_month,
        c.api_key_id,
        COUNT(DISTINCT DATE_TRUNC('month', r.created_at)::DATE) AS active_months
      FROM cohorts c
      LEFT JOIN pg.requests r ON r.api_key_id = c.api_key_id
      GROUP BY c.cohort_month, c.api_key_id
    )
    SELECT
      cohort_month AS cohortMonth,
      COUNT(DISTINCT api_key_id)::INTEGER AS apiKeys,
      COUNT(DISTINCT CASE WHEN active_months >= 1 THEN api_key_id END)::INTEGER AS active30d,
      COUNT(DISTINCT CASE WHEN active_months >= 2 THEN api_key_id END)::INTEGER AS active60d,
      COUNT(DISTINCT CASE WHEN active_months >= 3 THEN api_key_id END)::INTEGER AS active90d
    FROM activity
    GROUP BY cohort_month
    ORDER BY cohort_month DESC
  `;
  return client.query<CohortRow>(sql);
}

// ── Historical Parquet Queries ──────────────────────────────────────────────

export async function queryHistoricalParquet(
  client: DuckDBAnalyticsClient,
  tableName: string,
  azureStorageAccount: string,
  azureStorageKey: string,
  options: AnalyticsQueryOptions
): Promise<Record<string, unknown>[]> {
  const { clause } = buildWhere(options, "parquet");
  const sql = `
    SELECT *
    FROM read_parquet('az://${azureStorageAccount}.blob.core.windows.net/analytics/${tableName}/*/*/*/*.parquet', 
      ACCOUNT_NAME='${azureStorageAccount}', 
      ACCOUNT_KEY='${azureStorageKey}')
    WHERE ${clause}
  `;
  return client.query<Record<string, unknown>>(sql);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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
