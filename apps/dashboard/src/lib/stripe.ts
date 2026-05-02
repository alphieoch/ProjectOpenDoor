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

export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    description: "Up to $100/month LLM usage",
    priceId: process.env.STRIPE_STARTER_PRICE_ID || "",
    amount: 0,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Up to $1,000/month LLM usage",
    priceId: process.env.STRIPE_PRO_PRICE_ID || "",
    amount: 49,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Unlimited LLM usage + priority support",
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || "",
    amount: 299,
  },
];
