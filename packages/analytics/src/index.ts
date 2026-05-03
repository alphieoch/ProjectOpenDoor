export {
  DuckDBAnalyticsClient,
  getAnalyticsClient,
  withAnalyticsClient,
} from "./client.js";

export {
  getUsageDaily,
  getUsageTotals,
  getLatencyPercentiles,
  getModelBreakdown,
  getCostBreakdown,
  searchAuditLogs,
  getViolationTrends,
} from "./queries.js";

export {
  exportQueryToBuffer,
  getExportContentType,
  getExportFileName,
} from "./export.js";

export {
  detectLatencyAnomalies,
  getComplianceReport,
  getApiKeyCohorts,
  queryHistoricalParquet,
} from "./advanced.js";

export type {
  UsageDailyRow,
  UsageTotals,
  LatencyPercentiles,
  ModelBreakdownRow,
  CostBreakdownRow,
  AuditLogRow,
  ViolationTrendRow,
  AnalyticsQueryOptions,
  ExportFormat,
  AnomalyRow,
  ComplianceReportRow,
  CohortRow,
} from "./types.js";
