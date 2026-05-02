"use client";

import { useState, useEffect } from "react";
import { CreditCard, Check, Loader2, ExternalLink } from "lucide-react";

interface BillingInfo {
  id: string;
  name: string;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  monthlyBudgetUsd: string | null;
}

const PLANS = [
  {
    id: "free",
    name: "Free",
    description: "Pay-as-you-go with base markup",
    price: "$0/mo",
    features: [
      "Access to all models",
      "Standard markup pricing",
      "Basic usage analytics",
      "Community support",
    ],
    cta: "Current Plan",
    disabled: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Reduced markup for high-volume teams",
    price: "$49/mo",
    features: [
      "10% reduced markup on all models",
      "Priority API routing",
      "Advanced analytics & exports",
      "Email support",
      "Up to 5 team members",
    ],
    cta: "Upgrade to Pro",
    disabled: false,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Custom pricing & dedicated infrastructure",
    price: "$299/mo",
    features: [
      "Custom markup rates",
      "Dedicated Azure capacity",
      "SSO & advanced security",
      "24/7 phone support",
      "Unlimited team members",
      "Custom model deployments",
    ],
    cta: "Contact Sales",
    disabled: false,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
  },
];

export default function BillingPage() {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetch("/api/billing/info")
      .then((r) => r.json())
      .then((data) => {
        setInfo(data.org || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function subscribe(planId: string) {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan || plan.disabled) return;

    const priceId =
      planId === "pro"
        ? process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID
        : planId === "enterprise"
        ? process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID
        : null;

    if (!priceId) {
      alert("Stripe price ID not configured. Please set environment variables.");
      return;
    }

    setCheckoutLoading(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to start checkout");
      }
    } catch (e) {
      alert("Checkout failed");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to open billing portal");
      }
    } catch (e) {
      alert("Portal failed");
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const isSubscribed =
    info?.subscriptionStatus === "active" || info?.subscriptionStatus === "trialing";

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
      <p className="mt-1 text-gray-600">
        Manage your OpenDoor subscription and payment methods
      </p>

      {info && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Current Plan</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 capitalize">
                {info.plan}
              </p>
              {info.subscriptionStatus && (
                <span
                  className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isSubscribed
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {info.subscriptionStatus}
                </span>
              )}
            </div>
            {info.stripeCustomerId && (
              <button
                onClick={openPortal}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                {portalLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Manage Subscription
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = info?.plan === plan.id;
          return (
            <div
              key={plan.id}
              className={`rounded-lg border bg-white p-6 ${
                isCurrent
                  ? "border-primary-500 ring-1 ring-primary-500"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {plan.name}
                </h3>
                {isCurrent && (
                  <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-600">{plan.description}</p>
              <p className="mt-4 text-3xl font-bold text-gray-900">
                {plan.price}
              </p>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-green-500" />
                    <span className="text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() =>
                  plan.id === "enterprise" && !isCurrent
                    ? (window.location.href = "mailto:sales@opendoor.ai")
                    : subscribe(plan.id)
                }
                disabled={
                  isCurrent ||
                  plan.disabled ||
                  checkoutLoading === plan.id ||
                  (plan.id !== "free" && isSubscribed && !isCurrent)
                }
                className={`mt-6 w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  isCurrent
                    ? "bg-gray-100 text-gray-500"
                    : "bg-primary-600 text-white hover:bg-primary-700"
                }`}
              >
                {checkoutLoading === plan.id ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </span>
                ) : isCurrent ? (
                  "Current Plan"
                ) : plan.id === "enterprise" ? (
                  "Contact Sales"
                ) : isSubscribed && plan.id !== "free" ? (
                  "Switch Plan"
                ) : (
                  plan.cta
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-6">
        <div className="flex items-start gap-3">
          <CreditCard className="h-5 w-5 text-gray-500" />
          <div>
            <h3 className="text-sm font-medium text-gray-900">
              Usage-Based Billing
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              All plans are charged based on actual LLM usage. Your API key gives
              you access to <strong>all supported models</strong> — GPT-4o, Claude,
              Gemini, Mistral, DeepSeek, Qwen, and more. We apply a transparent
              markup on top of provider costs. Upgrade to Pro or Enterprise for
              reduced markups.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
