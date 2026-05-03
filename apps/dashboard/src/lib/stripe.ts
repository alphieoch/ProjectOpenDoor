import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripeInstance(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not defined");
  }
  _stripe = new Stripe(key, {
    apiVersion: "2025-03-31.basil",
    typescript: true,
  });
  return _stripe;
}

export type PlanId = "free" | "pro" | "enterprise";
export type ModelFamily = "closed" | "open_weight";

export const PLANS = [
  {
    id: "free",
    name: "Free",
    description: "Start with free credit, then prepaid top-ups",
    priceId: "",
    amount: 0,
    budgetPer4hCents: 0,
    markupByFamily: {
      closed: 5,
      open_weight: 35,
    },
  },
  {
    id: "pro",
    name: "Pro",
    description: "Lower markup plus included rolling usage allowance",
    priceId: process.env.STRIPE_PRO_PRICE_ID || "",
    amount: 49,
    budgetPer4hCents: Number.parseInt(
      process.env.PLAN_BUDGET_PRO_PER_4H_CENTS || "500",
      10
    ),
    markupByFamily: {
      closed: 3,
      open_weight: 30,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Highest allowance and lowest markups",
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || "",
    amount: 299.99,
    budgetPer4hCents: Number.parseInt(
      process.env.PLAN_BUDGET_ENTERPRISE_PER_4H_CENTS || "3000",
      10
    ),
    markupByFamily: {
      closed: 2,
      open_weight: 25,
    },
  },
] as const;

export const TOPUP_PRESETS = [
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

export function getPlanFromPriceId(priceId: string): PlanId {
  const plan = PLANS.find((p) => p.priceId === priceId);
  if (!plan) return "free";
  return plan.id;
}
