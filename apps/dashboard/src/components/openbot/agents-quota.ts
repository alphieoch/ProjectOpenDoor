import { formatUsd } from "@opendoor/shared";

export type CatalogModelOption = {
  id: string;
  label: string;
  provider?: string;
  ready?: boolean;
};

export type AgentsQuotaSources = {
  settings?: {
    usage?: { bots?: number; running?: number; messages30d?: number };
    limits?: {
      bots?: number;
      maxBots?: number;
      running?: number;
      maxConcurrentAgents?: number;
      plan?: string;
      addonActive?: boolean;
    };
    addon?: {
      active?: boolean;
      includedInPlan?: boolean;
      amountUsd?: number;
      status?: string;
    };
  } | null;
  balance?: {
    creditsUsdCents?: number;
    includedQuotaCents?: number;
    prepaidCreditsUsdCents?: number;
    includedMonthlyCents?: number;
  } | null;
  capacity?: {
    bots?: number;
    running?: number;
    maxBots?: number;
    maxConcurrentAgents?: number;
    plan?: string;
    addonActive?: boolean;
  } | null;
  channelCount?: number;
};

export type AgentsQuotaView = {
  spendCents: number;
  remainingCreditsCents: number;
  remainingStipendCents: number;
  includedMonthlyCents: number;
  prepaidCents: number;
  bots: number;
  maxBots: number;
  running: number;
  maxConcurrent: number;
  plan: string;
  addonActive: boolean;
  addonLabel: string;
  messages30d: number;
};

export function modelDisplayName(
  models: CatalogModelOption[],
  modelId: string | null | undefined,
): string {
  const id = (modelId || "").trim();
  if (!id) return "No model";
  return models.find((model) => model.id === id)?.label || id;
}

export function catalogOptionsFor(
  models: CatalogModelOption[],
  currentId: string,
): CatalogModelOption[] {
  if (!currentId || models.some((model) => model.id === currentId)) return models;
  return [{ id: currentId, label: currentId }, ...models];
}

export function stipendSpentCents(includedMonthlyCents: number, remainingQuotaCents: number): number {
  return Math.max(0, Math.round(includedMonthlyCents || 0) - Math.round(remainingQuotaCents || 0));
}

export function describeAgentsQuota(view: AgentsQuotaView) {
  return {
    spend: formatUsd(view.spendCents),
    remaining: formatUsd(view.remainingCreditsCents),
    stipend: `${formatUsd(view.remainingStipendCents)} of ${formatUsd(view.includedMonthlyCents)}`,
    agents: `${view.bots} / ${view.maxBots}`,
    running: `${view.running} / ${view.maxConcurrent}`,
  };
}

export function buildAgentsQuotaView(input: AgentsQuotaSources): AgentsQuotaView {
  const limits = input.settings?.limits;
  const usage = input.settings?.usage;
  const addon = input.settings?.addon;
  const capacity = input.capacity;
  const includedMonthlyCents = Math.max(0, Math.round(input.balance?.includedMonthlyCents || 0));
  const remainingStipendCents = Math.max(0, Math.round(input.balance?.includedQuotaCents || 0));
  const addonActive = Boolean(addon?.active ?? limits?.addonActive ?? capacity?.addonActive);
  const amount = addon?.amountUsd ?? 0;

  let addonLabel = addonActive ? "On" : "Off";
  if (addon?.includedInPlan) addonLabel = "Included";
  else if (addonActive && amount > 0) addonLabel = `$${amount}/mo`;
  else if (addon?.status && addon.status !== "active" && addon.status !== "inactive") {
    addonLabel = addon.status;
  }

  return {
    spendCents: stipendSpentCents(includedMonthlyCents, remainingStipendCents),
    remainingCreditsCents: Math.max(0, Math.round(input.balance?.creditsUsdCents || 0)),
    remainingStipendCents,
    includedMonthlyCents,
    prepaidCents: Math.max(0, Math.round(input.balance?.prepaidCreditsUsdCents || 0)),
    bots: usage?.bots ?? limits?.bots ?? capacity?.bots ?? input.channelCount ?? 0,
    maxBots: limits?.maxBots ?? capacity?.maxBots ?? 0,
    running: usage?.running ?? limits?.running ?? capacity?.running ?? 0,
    maxConcurrent: limits?.maxConcurrentAgents ?? capacity?.maxConcurrentAgents ?? 0,
    plan: limits?.plan || capacity?.plan || "free",
    addonActive,
    addonLabel,
    messages30d: usage?.messages30d ?? 0,
  };
}
