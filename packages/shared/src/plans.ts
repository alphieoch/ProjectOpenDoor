/**
 * Warehouse-club pricing: the seat is the profit, usage is the bargain.
 * Included monthly credit is a taste (always less than the membership),
 * then tokens and GPUs stay pay-as-you-go at list. Open-weight and closed
 * both spend that stipend — we do not wall student/Pro off open-weight.
 *
 * No free usage gift. Unpaid workspaces can log in, but inference needs a
 * paid seat and/or a prepaid top-up.
 *
 * First top-up of $20+ grants $5 of open-weight credit (expires in 30 days).
 * That bonus cannot buy closed models or cloud GPUs.
 */

export const TOPUP_BONUS_CENTS = 500;
export const TOPUP_BONUS_MIN_CENTS = 2000;
export const WELCOME_CREDIT_CENTS = TOPUP_BONUS_CENTS;
export const WELCOME_EXPIRES_DAYS = 30;

export function welcomeExpiresAt(from = new Date()) {
  return new Date(from.getTime() + WELCOME_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
}

export function qualifiesForTopupBonus(paidCents: number, alreadyGranted: boolean) {
  return !alreadyGranted && paidCents >= TOPUP_BONUS_MIN_CENTS;
}

export type CreditBuckets = {
  totalCents: number;
  welcomeCents: number;
  paidCents: number;
  expired: boolean;
  clawbackCents: number;
  expiresAt: Date | null;
};

export function splitCreditBuckets(
  org: {
    creditsUsdCents?: number | null;
    welcomeCreditsUsdCents?: number | null;
    welcomeExpiresAt?: Date | string | null;
  },
  now = new Date()
): CreditBuckets {
  const totalCents = Math.max(0, Number(org.creditsUsdCents || 0));
  const welcomeRaw = Math.max(0, Number(org.welcomeCreditsUsdCents || 0));
  const reserved = Math.min(welcomeRaw, totalCents);
  const expiresAt = org.welcomeExpiresAt ? new Date(org.welcomeExpiresAt) : null;
  const expired = Boolean(expiresAt && expiresAt.getTime() <= now.getTime() && reserved > 0);
  return {
    totalCents,
    welcomeCents: expired ? 0 : reserved,
    paidCents: Math.max(0, totalCents - reserved),
    expired,
    clawbackCents: expired ? reserved : 0,
    expiresAt,
  };
}

export function welcomeAllowedForFamily(family: string | null | undefined) {
  return family === "open_weight";
}

export function spendableCents(buckets: CreditBuckets, allowWelcome: boolean) {
  return allowWelcome ? buckets.paidCents + buckets.welcomeCents : buckets.paidCents;
}

/**
 * Site admins and the explicit `unlimited` plan skip prepaid/quota gates.
 * Enterprise and other paid plans still spend included stipend + top-ups.
 */
export function billingIsUnlimited(opts: {
  isSiteAdmin?: boolean | null;
  plan?: string | null;
}): boolean {
  if (opts.isSiteAdmin) return true;
  return (opts.plan || "").toLowerCase() === "unlimited";
}

export function canCoverEstimatedSpend(opts: {
  isSiteAdmin?: boolean | null;
  plan?: string | null;
  spendableCents: number;
  estimatedCostCents: number;
}): boolean {
  if (billingIsUnlimited(opts)) return true;
  return opts.spendableCents >= Math.max(0, opts.estimatedCostCents);
}

/** Hidden key used by AI Assistants to bill the owner org through the gateway. */
export const SYSTEM_ASSISTANT_KEY_NAME = "__opendoor_system_assistants__";

export type CreditWaterfall = {
  quotaCents: number;
  prepaidCents: number;
  welcomeCents: number;
  spendableClosedCents: number;
  spendableOpenCents: number;
  monthPlanGrantCents: number;
  monthUsageCents: number;
  cutOff: boolean;
};

/**
 * Included monthly stipend is spent first, then prepaid top-ups.
 * Welcome/open-weight bonus is never treated as prepaid or quota.
 */
export function creditWaterfall(args: {
  buckets: CreditBuckets;
  monthPlanGrantCents: number;
  monthUsageCents: number;
}): CreditWaterfall {
  const monthPlanGrantCents = Math.max(0, Math.round(args.monthPlanGrantCents || 0));
  const monthUsageCents = Math.max(0, Math.round(args.monthUsageCents || 0));
  const unusedGrant = Math.max(0, monthPlanGrantCents - monthUsageCents);
  const quotaCents = Math.min(args.buckets.paidCents, unusedGrant);
  const prepaidCents = Math.max(0, args.buckets.paidCents - quotaCents);
  const welcomeCents = args.buckets.welcomeCents;
  const spendableClosedCents = quotaCents + prepaidCents;
  const spendableOpenCents = spendableClosedCents + welcomeCents;
  return {
    quotaCents,
    prepaidCents,
    welcomeCents,
    spendableClosedCents,
    spendableOpenCents,
    monthPlanGrantCents,
    monthUsageCents,
    cutOff: spendableClosedCents <= 0,
  };
}

export type PlanId =
  | "free"
  | "starter"
  | "student"
  | "pro"
  | "ultra"
  | "family"
  | "family_max"
  | "team"
  | "enterprise";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  amountUsd: number;
  perSeat: boolean;
  maxSeats?: number;
  rolloverMonths?: number;
  isPool?: boolean;
  includedCreditsCents: number;
  rateLimitMultiplier: number;
  maxApiKeys: number;
  maxActiveDeployments: number;
  priorityQueue: boolean;
  markupByFamily: { closed: number; open_weight: number };
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Starter Free",
    amountUsd: 0,
    perSeat: false,
    maxSeats: 1,
    includedCreditsCents: 0,
    rateLimitMultiplier: 1,
    maxApiKeys: 3,
    maxActiveDeployments: 1,
    priorityQueue: false,
    markupByFamily: { closed: 5, open_weight: 35 },
  },
  starter: {
    id: "starter",
    name: "Starter Free",
    amountUsd: 0,
    perSeat: false,
    maxSeats: 1,
    includedCreditsCents: 0,
    rateLimitMultiplier: 1,
    maxApiKeys: 3,
    maxActiveDeployments: 1,
    priorityQueue: false,
    markupByFamily: { closed: 5, open_weight: 35 },
  },
  student: {
    id: "student",
    name: "Student",
    amountUsd: 9.99,
    perSeat: false,
    maxSeats: 1,
    includedCreditsCents: 200,
    rateLimitMultiplier: 2,
    maxApiKeys: 5,
    maxActiveDeployments: 1,
    priorityQueue: false,
    markupByFamily: { closed: 3, open_weight: 30 },
  },
  pro: {
    id: "pro",
    name: "Pro Studio",
    amountUsd: 12,
    perSeat: false,
    maxSeats: 1,
    includedCreditsCents: 400,
    rateLimitMultiplier: 3,
    maxApiKeys: 10,
    maxActiveDeployments: 2,
    priorityQueue: true,
    markupByFamily: { closed: 3, open_weight: 30 },
  },
  ultra: {
    id: "ultra",
    name: "Ultra Studio",
    amountUsd: 45,
    perSeat: false,
    maxSeats: 1,
    includedCreditsCents: 1200,
    rateLimitMultiplier: 6,
    maxApiKeys: 25,
    maxActiveDeployments: 5,
    priorityQueue: true,
    markupByFamily: { closed: 2.5, open_weight: 25 },
  },
  family: {
    id: "family",
    name: "Family Pool",
    amountUsd: 29.99,
    perSeat: false,
    maxSeats: 4,
    rolloverMonths: 4,
    isPool: true,
    includedCreditsCents: 2200,
    rateLimitMultiplier: 5,
    maxApiKeys: 20,
    maxActiveDeployments: 4,
    priorityQueue: true,
    markupByFamily: { closed: 2.5, open_weight: 25 },
  },
  family_max: {
    id: "family_max",
    name: "Family Max Pool",
    amountUsd: 99,
    perSeat: false,
    maxSeats: 5,
    rolloverMonths: 4,
    isPool: true,
    includedCreditsCents: 7500,
    rateLimitMultiplier: 10,
    maxApiKeys: 50,
    maxActiveDeployments: 10,
    priorityQueue: true,
    markupByFamily: { closed: 2, open_weight: 20 },
  },
  team: {
    id: "team",
    name: "Team Workspace",
    amountUsd: 50,
    perSeat: true,
    includedCreditsCents: 1500,
    rateLimitMultiplier: 5,
    maxApiKeys: 50,
    maxActiveDeployments: 5,
    priorityQueue: true,
    markupByFamily: { closed: 2.5, open_weight: 28 },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    amountUsd: 120,
    perSeat: true,
    includedCreditsCents: 3500,
    rateLimitMultiplier: 10,
    maxApiKeys: 500,
    maxActiveDeployments: 20,
    priorityQueue: true,
    markupByFamily: { closed: 2, open_weight: 25 },
  },
};

export const ACTIVE_DEPLOYMENT_STATUSES = ["pending", "building", "running"] as const;

export function getPlan(plan: string | null | undefined): PlanDefinition {
  if (plan && plan in PLANS) return PLANS[plan as PlanId];
  return PLANS.free;
}

export function includedCreditCents(plan: string, seats = 1): number {
  const def = getPlan(plan);
  const qty = def.perSeat ? Math.max(1, seats) : 1;
  return def.includedCreditsCents * qty;
}

/** Household club math vs buying that many Pro seats. */
export function familyClubValue(planId: Extract<PlanId, "family" | "family_max">) {
  const family = PLANS[planId];
  const seats = Math.max(1, family.maxSeats ?? 1);
  const soloPriceUsd = PLANS.pro.amountUsd * seats;
  const soloCreditCents = PLANS.pro.includedCreditsCents * seats;
  return {
    seats,
    priceUsd: family.amountUsd,
    perPersonUsd: family.amountUsd / seats,
    soloPriceUsd,
    saveVsSoloUsd: Math.round(Math.max(0, soloPriceUsd - family.amountUsd)),
    poolCents: family.includedCreditsCents,
    soloCreditCents,
    extraPoolCents: family.includedCreditsCents - soloCreditCents,
    rolloverMonths: family.rolloverMonths ?? 0,
  };
}

export function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function formatPlanPriceUsd(amountUsd: number) {
  return amountUsd % 1 === 0 ? `$${amountUsd}` : `$${amountUsd.toFixed(2)}`;
}

/** Customer list = Google all-in × ~1.25. Metal is the customer’s machine. */
export const GPU_RATES = {
  "nvidia-l4": {
    sku: "nvidia-l4",
    displayName: "NVIDIA L4",
    wholesaleHourlyUsd: 1.05,
    listHourlyUsd: 1.29,
    sortOrder: 10,
    regionMultiplier: 1,
  },
  "nvidia-a100": {
    sku: "nvidia-a100",
    displayName: "NVIDIA A100 80GB",
    wholesaleHourlyUsd: 5.07,
    listHourlyUsd: 6.25,
    sortOrder: 20,
    regionMultiplier: 1,
  },
  "nvidia-h100": {
    sku: "nvidia-h100",
    displayName: "NVIDIA H100 80GB",
    wholesaleHourlyUsd: 11.06,
    listHourlyUsd: 13.5,
    sortOrder: 30,
    regionMultiplier: 1.25,
  },
} as const;

export const GCP_GPU_MIN_CREDIT_CENTS = 200;
export const GCP_RESERVED_MIN_CREDIT_CENTS = 500;

export function gcpStartCreditCents(reserved: boolean) {
  return reserved ? GCP_RESERVED_MIN_CREDIT_CENTS : GCP_GPU_MIN_CREDIT_CENTS;
}

/** Hosted OpenClaw / Hermes / NemoClaw / OpenBot — monthly add-on, tokens still bill quota. */
export const AGENTS_ADDON = {
  id: "agents" as const,
  name: "Agents",
  amountUsd: 20,
  amountCents: 2000,
  description: "Hosted OpenClaw, Hermes, NemoClaw, and OpenBot runtimes on this workspace.",
};

export function agentsAddonActive(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

export function isEnterprisePlan(plan?: string | null): boolean {
  return (plan || "").toLowerCase() === "enterprise";
}

/**
 * Governance / tools pack on the customer’s site: Search, Agents, SSO/SCIM,
 * audit logs, and Trust Center. Enterprise seats and site admins.
 */
export function workspaceHasEnterpriseTools(org: {
  plan?: string | null;
  isSiteAdmin?: boolean | null;
}): boolean {
  if (org.isSiteAdmin) return true;
  return isEnterprisePlan(org.plan);
}

export function workspaceHasAgentsAddon(org: {
  plan?: string | null;
  agentsAddonStatus?: string | null;
  isSiteAdmin?: boolean | null;
}) {
  if (workspaceHasEnterpriseTools(org)) return true;
  if ((org.plan || "").toLowerCase() === "family_max") return true;
  return agentsAddonActive(org.agentsAddonStatus);
}

/** Vertex AI Grounding with Google Search — monthly add-on. Platform GCP keys stay on the server. */
export const WEB_SEARCH_ADDON = {
  id: "web_search" as const,
  name: "Web Search",
  amountUsd: 20,
  amountCents: 2000,
  description:
    "Covers OpenDoor Search and live Google results via Vertex AI Grounding for the month. Otherwise Search is list price per query.",
};

export function webSearchAddonActive(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

export function workspaceHasWebSearchAddon(org: {
  plan?: string | null;
  webSearchAddonStatus?: string | null;
  isSiteAdmin?: boolean | null;
}) {
  if (workspaceHasEnterpriseTools(org)) return true;
  return webSearchAddonActive(org.webSearchAddonStatus);
}

