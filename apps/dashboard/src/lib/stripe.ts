import Stripe from "stripe";
import { PLANS, getPlan, type PlanId } from "@opendoor/shared";

let _stripe: Stripe | null = null;

export function getStripeInstance(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not defined");
  }
  _stripe = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return _stripe;
}

export type { PlanId };
export type ModelFamily = "closed" | "open_weight";

export const STRIPE_PLANS = [
  {
    id: "free" as const,
    name: PLANS.free.name,
    description: "Top up to use the API. $20+ adds $5 open-weight credit once.",
    priceId: "",
    amount: PLANS.free.amountUsd,
    includedCreditsCents: PLANS.free.includedCreditsCents,
    markupByFamily: PLANS.free.markupByFamily,
  },
  {
    id: "student" as const,
    name: getPlan("student").name,
    description: "Student membership with a small inference taste, then warehouse-rate tokens",
    priceId: process.env.STRIPE_STUDENT_PRICE_ID || "",
    amount: getPlan("student").amountUsd,
    includedCreditsCents: getPlan("student").includedCreditsCents,
    markupByFamily: getPlan("student").markupByFamily,
  },
  {
    id: "pro" as const,
    name: PLANS.pro.name,
    description: "Personal workspace with a monthly inference stipend",
    priceId: process.env.STRIPE_PRO_PRICE_ID || "",
    amount: PLANS.pro.amountUsd,
    includedCreditsCents: PLANS.pro.includedCreditsCents,
    markupByFamily: PLANS.pro.markupByFamily,
  },
  {
    id: "team" as const,
    name: PLANS.team.name,
    description: "SSO, audit logs, and a per-seat inference stipend",
    priceId: process.env.STRIPE_TEAM_PRICE_ID || "",
    amount: PLANS.team.amountUsd,
    includedCreditsCents: PLANS.team.includedCreditsCents,
    markupByFamily: PLANS.team.markupByFamily,
  },
  {
    id: "enterprise" as const,
    name: PLANS.enterprise.name,
    description: "SCIM, residency, and the highest rate limits",
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || "",
    amount: PLANS.enterprise.amountUsd,
    includedCreditsCents: PLANS.enterprise.includedCreditsCents,
    markupByFamily: PLANS.enterprise.markupByFamily,
  },
] as const;

/** @deprecated use STRIPE_PLANS — kept so existing imports keep working */
export const PLANS_STRIPE = STRIPE_PLANS;
export { STRIPE_PLANS as PLANS };

export const TOPUP_PRESETS = [
  {
    amountCents: 2000,
    label: "$20",
    priceId: process.env.STRIPE_TOPUP_20_PRICE_ID || "",
  },
  {
    amountCents: 3000,
    label: "$30",
    priceId: process.env.STRIPE_TOPUP_30_PRICE_ID || "",
  },
  {
    amountCents: 5000,
    label: "$50",
    priceId: process.env.STRIPE_TOPUP_50_PRICE_ID || "",
  },
  {
    amountCents: 10000,
    label: "$100",
    priceId: process.env.STRIPE_TOPUP_100_PRICE_ID || "",
  },
  {
    amountCents: 20000,
    label: "$200",
    priceId: process.env.STRIPE_TOPUP_200_PRICE_ID || "",
  },
] as const;

const PLAN_PRICE_ENV: Record<Exclude<PlanId, "free">, string> = {
  starter: "STRIPE_STARTER_PRICE_ID",
  student: "STRIPE_STUDENT_PRICE_ID",
  pro: "STRIPE_PRO_PRICE_ID",
  ultra: "STRIPE_ULTRA_PRICE_ID",
  family: "STRIPE_FAMILY_PRICE_ID",
  family_max: "STRIPE_FAMILY_MAX_PRICE_ID",
  team: "STRIPE_TEAM_PRICE_ID",
  enterprise: "STRIPE_ENTERPRISE_PRICE_ID",
};

export function getPriceIdForPlan(planId: PlanId): string {
  if (planId === "free") return "";
  return process.env[PLAN_PRICE_ENV[planId]] || "";
}

export function getPlanFromPriceId(priceId: string): PlanId {
  if (!priceId) return "free";
  for (const id of ["starter", "student", "pro", "ultra", "family", "family_max", "team", "enterprise"] as const) {
    if (getPriceIdForPlan(id) === priceId) return id;
  }
  return "free";
}

export function checkoutPlanConfigured(planId: PlanId): boolean {
  return Boolean(getPriceIdForPlan(planId));
}

export function agentsAddonPriceId() {
  return process.env.STRIPE_AGENTS_ADDON_PRICE_ID || "";
}

export function isAgentsAddonPriceId(priceId: string | null | undefined) {
  const configured = agentsAddonPriceId();
  return Boolean(configured && priceId && priceId === configured);
}

export function webSearchAddonPriceId() {
  return process.env.STRIPE_WEB_SEARCH_ADDON_PRICE_ID || "";
}

export function isWebSearchAddonPriceId(priceId: string | null | undefined) {
  const configured = webSearchAddonPriceId();
  return Boolean(configured && priceId && priceId === configured);
}

export function checkoutIntegrationId(flow: "subscription" | "topup" | "addon"): string {
  const suffix = Array.from({ length: 8 }, () =>
    "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("");
  return `opendoor-${flow}-${suffix}`;
}
