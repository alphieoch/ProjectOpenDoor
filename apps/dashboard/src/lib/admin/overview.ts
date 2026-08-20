export type StatusCount = { key: string; count: unknown };

export function asCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function errorRatePct(errors: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((errors / total) * 1000) / 10;
}

export function countsByKey(rows: StatusCount[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = (row.key ?? "").toString().trim() || "unknown";
    out[key] = (out[key] || 0) + asCount(row.count);
  }
  return out;
}

export function sumRecord(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

export function countInStatuses(byStatus: Record<string, number>, keys: string[]): number {
  return keys.reduce((n, key) => n + (byStatus[key] || 0), 0);
}

export function formatUsdCompact(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function creditsCentsToUsd(cents: unknown): number {
  return asCount(cents) / 100;
}

export type AdminOverviewTraffic = {
  last24h: { requests: number; errors: number; avgLatencyMs: number; costUsd: number };
  last7d: { requests: number; errors: number; avgLatencyMs: number; costUsd: number };
  requestSeries: number[];
  errorSeries: number[];
};

export type AdminOverviewPrograms = {
  orgs: number;
  orgsByPlan: Record<string, number>;
  users: number;
  siteAdmins: number;
  agents: number;
  agentsRunning: number;
  trainingJobs: number;
  trainingActive: number;
  workflows: number;
  workflowsActive: number;
  deployments: number;
  deploymentsRunning: number;
};

export type AdminOverviewHealth = {
  gatewayStatus: "up" | "down" | "unknown";
  gatewayLatencyMs: number | null;
  databaseStatus: "up" | "down" | "unknown";
  redisStatus: "up" | "down" | "unknown";
  walletUsd: number;
  creditInflowUsd: number;
  source: string;
};

export type AdminFailureRow = {
  id: string;
  modelId: string;
  errorMessage: string | null;
  latencyMs: number;
  createdAt: string;
  orgName: string | null;
};

export type AdminAuditRow = {
  id: string;
  action: string;
  entityType: string | null;
  createdAt: string;
  orgName: string | null;
  userEmail: string | null;
};

export type AdminOverview = {
  traffic: AdminOverviewTraffic;
  programs: AdminOverviewPrograms;
  health: AdminOverviewHealth;
  recentFailures: AdminFailureRow[];
  recentAudit: AdminAuditRow[];
  posthogUrl: string | null;
};
