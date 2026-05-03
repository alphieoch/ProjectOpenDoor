export interface UsageDailyRow {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface UsageTotals {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
}

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}

export interface ModelBreakdownRow {
  modelId: string;
  providerName: string;
  requests: number;
  totalTokens: number;
  costUsd: number;
  avgLatencyMs: number;
}

export interface CostBreakdownRow {
  providerName: string;
  modelId: string;
  region: string;
  requests: number;
  totalCost: number;
  markupPercent: number;
}

export interface AuditLogRow {
  id: string;
  organizationId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  orgName: string | null;
}

export interface ViolationTrendRow {
  date: string;
  violationType: string;
  severity: string;
  count: number;
}

export interface AnalyticsQueryOptions {
  organizationId: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export type ExportFormat = "csv" | "parquet" | "json";

// ── Advanced Analytics Types ────────────────────────────────────────────────

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
