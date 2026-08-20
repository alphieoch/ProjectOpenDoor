/** Pure usage / quota labels for Account pages. Keep this file free of I/O. */

export type DailyUsageTotals = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  errors: number;
  hasStatus: boolean;
};

export type DailyUsageRow = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  errorCount?: number | null;
};

export function formatUsdCents(cents: number): string {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatBalanceLabel(opts: {
  unlimited: boolean;
  cents: number;
}): string {
  if (opts.unlimited) return "Unlimited";
  return formatUsdCents(opts.cents);
}

export function tokenSplit(promptTokens: number, completionTokens: number) {
  const prompt = Math.max(0, Number(promptTokens || 0));
  const completion = Math.max(0, Number(completionTokens || 0));
  const total = prompt + completion;
  if (total <= 0) return { promptPct: 0, completionPct: 0, total: 0 };
  const promptPct = Math.round((prompt / total) * 100);
  return { promptPct, completionPct: 100 - promptPct, total };
}

export function splitModelTokens(opts: {
  totalTokens: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  orgPromptTokens: number;
  orgCompletionTokens: number;
}): { promptTokens: number; completionTokens: number } {
  const explicitPrompt = Number(opts.promptTokens);
  const explicitCompletion = Number(opts.completionTokens);
  if (Number.isFinite(explicitPrompt) && Number.isFinite(explicitCompletion) && (explicitPrompt > 0 || explicitCompletion > 0)) {
    return {
      promptTokens: Math.max(0, Math.round(explicitPrompt)),
      completionTokens: Math.max(0, Math.round(explicitCompletion)),
    };
  }
  const total = Math.max(0, Number(opts.totalTokens || 0));
  const orgTotal = Math.max(0, opts.orgPromptTokens) + Math.max(0, opts.orgCompletionTokens);
  if (total <= 0 || orgTotal <= 0) {
    return { promptTokens: 0, completionTokens: total };
  }
  const promptTokens = Math.round(total * (opts.orgPromptTokens / orgTotal));
  return { promptTokens, completionTokens: Math.max(0, total - promptTokens) };
}

export function summarizeDailyUsage(daily: DailyUsageRow[]): DailyUsageTotals {
  return daily.reduce<DailyUsageTotals>(
    (acc, row) => ({
      requests: acc.requests + Number(row.requests || 0),
      promptTokens: acc.promptTokens + Number(row.promptTokens || 0),
      completionTokens: acc.completionTokens + Number(row.completionTokens || 0),
      cost: acc.cost + Number(row.costUsd || 0),
      errors: acc.errors + Number(row.errorCount ?? 0),
      hasStatus: acc.hasStatus || row.errorCount != null,
    }),
    { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0, errors: 0, hasStatus: false },
  );
}

export function errorRateLabel(errors: number, requests: number, hasStatus: boolean): string {
  if (!hasStatus || requests <= 0) return "—";
  return `${((errors / requests) * 100).toFixed(1)}%`;
}

export function periodEmptyCopy(days: number): { title: string; body: string } {
  const window = Number.isFinite(days) && days > 0 ? days : 30;
  return {
    title: "No usage this period",
    body: `No gateway requests in the last ${window} days. Send a playground or API call to see spend here.`,
  };
}

export function formatLatencyMs(ms: number | null | undefined): string {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${Math.round(value)}ms`;
}

export function unlimitedReasonLabel(reason: "site_admin" | "plan" | null | undefined): string {
  if (reason === "site_admin") return "Site admin — usage is metered for visibility, spend is not cut off.";
  if (reason === "plan") return "Unlimited plan — usage is metered for visibility, spend is not cut off.";
  return "This workspace is not billed for inference.";
}
