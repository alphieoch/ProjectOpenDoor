"use client";

import { useState, useEffect } from "react";
import { CreditCard, Check, Loader2, ExternalLink, Wallet, Zap } from "lucide-react";

interface BillingInfo {
  id: string;
  name: string;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  monthlyBudgetUsd: string | null;
  creditsUsdCents: number | null;
}

interface CreditTransaction {
  id: string;
  kind: string;
  amountCents: number;
  balanceAfterCents: number;
  createdAt: string;
}

interface BalanceData {
  creditsUsdCents: number;
  planBudget: {
    usedCents: number;
    totalCents: number;
    remainingCents: number;
    resetsAt: string;
  };
  autoRecharge: {
    enabled: boolean;
    amountCents: number;
    thresholdCents: number;
  };
  recentTransactions: CreditTransaction[];
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
    description: "Lower markups plus rolling included usage",
    price: "$49/mo",
    features: [
      "$5 usage allowance every 4 hours",
      "3% markup on OpenAI/Claude/Grok/Gemini",
      "30% markup on open-weight models",
      "Priority API routing",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    disabled: false,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Highest allowance and lowest markups",
    price: "$299.99/mo",
    features: [
      "$30 usage allowance every 4 hours",
      "2% markup on OpenAI/Claude/Grok/Gemini",
      "25% markup on open-weight models",
      "SSO & advanced security",
      "Dedicated Azure capacity",
      "24/7 support",
      "Unlimited team members",
    ],
    cta: "Upgrade to Enterprise",
    disabled: false,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
  },
];

const TOPUP_PRESETS = [3000, 5000, 10000, 20000];

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function BillingPage() {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [topupLoading, setTopupLoading] = useState<number | null>(null);
  const [customTopup, setCustomTopup] = useState("50");
  const [portalLoading, setPortalLoading] = useState(false);
  const [autoRecharge, setAutoRecharge] = useState({
    enabled: false,
    thresholdCents: 0,
    amountCents: 0,
    hasPaymentMethod: false,
    hasStripeCustomer: false,
  });
  const [autoRechargeLoading, setAutoRechargeLoading] = useState(false);
  const [autoRechargeSaving, setAutoRechargeSaving] = useState(false);

  async function loadState() {
    const [infoRes, balanceRes, arRes] = await Promise.all([
      fetch("/api/billing/info"),
      fetch("/api/billing/balance"),
      fetch("/api/billing/auto-recharge"),
    ]);
    const infoData = await infoRes.json();
    const balanceData = await balanceRes.json();
    const arData = arRes.ok ? await arRes.json() : null;
    setInfo(infoData.org || null);
    setBalance(balanceData || null);
    if (arData && !arData.error) {
      setAutoRecharge(arData);
    }
  }

  useEffect(() => {
    loadState().then(() => setLoading(false)).catch(() => setLoading(false));
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
      alert("Stripe price ID not configured.");
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
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Failed to start checkout");
    } catch {
      alert("Checkout failed");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function topup(amountCents: number) {
    setTopupLoading(amountCents);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Failed to start top-up");
    } catch {
      alert("Top-up failed");
    } finally {
      setTopupLoading(null);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Failed to open billing portal");
    } catch {
      alert("Portal failed");
    } finally {
      setPortalLoading(false);
    }
  }

  async function saveAutoRecharge() {
    setAutoRechargeSaving(true);
    try {
      const res = await fetch("/api/billing/auto-recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: autoRecharge.enabled,
          thresholdCents: autoRecharge.thresholdCents,
          amountCents: autoRecharge.amountCents,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setAutoRecharge(data);
      }
    } catch {
      alert("Failed to save auto-recharge settings");
    } finally {
      setAutoRechargeSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-4)" }} />
      </div>
    );
  }

  const isSubscribed =
    info?.subscriptionStatus === "active" || info?.subscriptionStatus === "trialing";
  const progressPercent =
    balance?.planBudget.totalCents && balance.planBudget.totalCents > 0
      ? Math.min(100, Math.round((balance.planBudget.usedCents / balance.planBudget.totalCents) * 100))
      : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Billing</h1>
        <p className="page-desc">Manage subscriptions, prepaid credits, and token-based usage</p>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
            <Wallet className="h-4 w-4" />
            <p className="text-sm font-medium">Prepaid Balance</p>
          </div>
          <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--ink)" }}>
            {centsToUsd(balance?.creditsUsdCents || 0)}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-4)" }}>
            $20 signup credit on first organization creation.
          </p>
        </div>

        <div className="card p-6">
          <p className="text-sm font-medium" style={{ color: "var(--ink-3)" }}>4h Plan Allowance</p>
          <p className="mt-2 text-lg font-semibold capitalize" style={{ color: "var(--ink)" }}>
            {info?.plan || "free"}
          </p>
          <div className="mt-4 h-1.5 w-full rounded-full" style={{ background: "var(--paper-3)" }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ background: "var(--ink)", width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
            {centsToUsd(balance?.planBudget.usedCents || 0)} used of{" "}
            {centsToUsd(balance?.planBudget.totalCents || 0)}. Resets at{" "}
            {balance?.planBudget.resetsAt
              ? new Date(balance.planBudget.resetsAt).toLocaleTimeString()
              : "—"}
          </p>
        </div>
      </div>

      {/* Subscription status */}
      {info && (
        <div className="mt-4 card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: "var(--ink-3)" }}>Subscription</p>
              <p className="mt-1 text-2xl font-semibold capitalize" style={{ color: "var(--ink)" }}>
                {info.plan}
              </p>
              {info.subscriptionStatus && (
                <span className={`mt-2 inline-block ${isSubscribed ? "badge-success" : "badge-warning"}`}>
                  {info.subscriptionStatus}
                </span>
              )}
            </div>
            {info.stripeCustomerId && (
              <button
                onClick={openPortal}
                disabled={portalLoading}
                className="btn-secondary"
              >
                {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Manage Subscription
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top up */}
      <div className="mt-4 card p-6">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ink-4)" }} />
          <div className="w-full">
            <h3 className="section-title">Top up API credits</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
              Buy prepaid credit — we deduct usage costs automatically per request.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TOPUP_PRESETS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => topup(amount)}
                  disabled={topupLoading !== null}
                  className="btn-secondary"
                >
                  {topupLoading === amount ? "Loading…" : centsToUsd(amount)}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="number"
                min={5}
                max={5000}
                step={1}
                value={customTopup}
                onChange={(e) => setCustomTopup(e.target.value)}
                placeholder="Amount (USD)"
                aria-label="Custom top-up amount in USD"
                className="input w-36"
              />
              <button
                onClick={() => topup(Math.round(Number(customTopup || 0) * 100))}
                disabled={topupLoading !== null}
                className="btn-primary"
              >
                Top up
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-recharge */}
      <div className="mt-4 card p-6">
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ink-4)" }} />
          <div className="w-full">
            <h3 className="section-title">Auto-recharge</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
              Automatically top up credits when your balance drops below a threshold.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoRecharge.enabled}
                  onChange={(e) =>
                    setAutoRecharge((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded accent-[var(--brand)]"
                />
                <span className="text-sm" style={{ color: "var(--ink-2)" }}>Enable auto-recharge</span>
              </label>
            </div>

            {autoRecharge.enabled && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium" style={{ color: "var(--ink-3)" }}>
                    Threshold (USD)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={Math.round(autoRecharge.thresholdCents / 100)}
                    onChange={(e) =>
                      setAutoRecharge((prev) => ({
                        ...prev,
                        thresholdCents: Math.round(Number(e.target.value || 0) * 100),
                      }))
                    }
                    className="input mt-1 w-full"
                    aria-label="Auto-recharge threshold (USD)"
                  />
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-4)" }}>
                    Recharge when balance drops below this amount.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium" style={{ color: "var(--ink-3)" }}>
                    Recharge amount (USD)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={5000}
                    step={1}
                    value={Math.round(autoRecharge.amountCents / 100)}
                    onChange={(e) =>
                      setAutoRecharge((prev) => ({
                        ...prev,
                        amountCents: Math.round(Number(e.target.value || 0) * 100),
                      }))
                    }
                    className="input mt-1 w-full"
                    aria-label="Auto-recharge amount (USD)"
                  />
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-4)" }}>
                    How much to add each time.
                  </p>
                </div>
              </div>
            )}

            {autoRecharge.enabled && !autoRecharge.hasPaymentMethod && (
              <p className="mt-3 text-xs text-amber-600">
                You need a saved payment method for auto-recharge to work.{" "}
                <button onClick={openPortal} className="underline">
                  Add one in the billing portal
                </button>
                .
              </p>
            )}

            <div className="mt-4">
              <button
                onClick={saveAutoRecharge}
                disabled={autoRechargeSaving}
                className="btn-secondary"
              >
                {autoRechargeSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save settings"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Plan cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = info?.plan === plan.id;
          return (
            <div
              key={plan.id}
              className={`card p-6 ${isCurrent ? "ring-2 ring-[var(--ink)]" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: "var(--ink)" }}>{plan.name}</h3>
                {isCurrent && <span className="badge-neutral">Current</span>}
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>{plan.description}</p>
              <p className="mt-4 text-2xl font-semibold" style={{ color: "var(--ink)" }}>{plan.price}</p>

              <ul className="mt-5 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--green)" }} />
                    <span style={{ color: "var(--ink-2)" }}>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => subscribe(plan.id)}
                disabled={isCurrent || plan.disabled || checkoutLoading === plan.id || (plan.id !== "free" && isSubscribed && !isCurrent)}
                className={`mt-6 w-full ${isCurrent || plan.disabled ? "btn-secondary opacity-60" : "btn-primary"}`}
              >
                {checkoutLoading === plan.id ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Loading…</>
                ) : isCurrent ? "Current Plan" : isSubscribed && plan.id !== "free" ? "Switch Plan" : plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* Markup table */}
      <div className="mt-6 card p-6">
        <h3 className="section-title mb-4">Markup by model family</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="table-header-cell">Family</th>
                <th className="table-header-cell">Free</th>
                <th className="table-header-cell">Pro</th>
                <th className="table-header-cell">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              <tr className="table-row">
                <td className="table-cell" style={{ color: "var(--ink-2)" }}>Closed (OpenAI/Claude/Grok/Gemini)</td>
                <td className="table-cell" style={{ color: "var(--ink-3)" }}>5%</td>
                <td className="table-cell" style={{ color: "var(--ink-3)" }}>3%</td>
                <td className="table-cell" style={{ color: "var(--ink-3)" }}>2%</td>
              </tr>
              <tr className="table-row">
                <td className="table-cell" style={{ color: "var(--ink-2)" }}>Open-weight (Mistral/DeepSeek/Qwen/custom)</td>
                <td className="table-cell" style={{ color: "var(--ink-3)" }}>35%</td>
                <td className="table-cell" style={{ color: "var(--ink-3)" }}>30%</td>
                <td className="table-cell" style={{ color: "var(--ink-3)" }}>25%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Transactions */}
      <div className="mt-6 card p-6">
        <h3 className="section-title mb-4">Recent credit transactions</h3>
        <div className="space-y-1.5">
          {(balance?.recentTransactions || []).slice(0, 8).map((txn) => (
            <div
              key={txn.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--line)", background: "var(--paper-2)" }}
            >
              <span className="capitalize" style={{ color: "var(--ink-2)" }}>{txn.kind.replace("_", " ")}</span>
              <span className={txn.amountCents >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"}>
                {txn.amountCents >= 0 ? "+" : "−"}{centsToUsd(Math.abs(txn.amountCents))}
              </span>
            </div>
          ))}
          {(!balance?.recentTransactions || balance.recentTransactions.length === 0) && (
            <p className="py-4 text-center text-sm" style={{ color: "var(--ink-4)" }}>
              No credit transactions yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
