"use client";

import { useState, useEffect } from "react";
import { CreditCard, Check, Loader2, ExternalLink, Sparkles, Wallet, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ACCOUNT_PLANS } from "@/lib/account-plans";
import { PLANS, TOPUP_BONUS_MIN_CENTS, formatUsd } from "@opendoor/shared";

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
  welcomeCreditsUsdCents?: number;
  paidCreditsUsdCents?: number;
  welcomeExpiresAt?: string | null;
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

const TOPUP_PRESETS = [2000, 3000, 5000, 10000];
const MARKUP_FAMILIES = [
  { id: "closed" as const, label: "Closed (OpenAI/Claude/Grok/Gemini)" },
  { id: "open_weight" as const, label: "Open-weight (Mistral/DeepSeek/Qwen/custom)" },
];
const MARKUP_COLUMNS = ["free", "pro", "team", "enterprise"] as const;

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function BillingPage() {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [topupLoading, setTopupLoading] = useState<number | null>(null);
  const [customTopup, setCustomTopup] = useState("20");
  const [portalLoading, setPortalLoading] = useState(false);
  const [seats, setSeats] = useState(1);
  const [checkoutReady, setCheckoutReady] = useState({ pro: false, team: false, agents: false });
  const [addon, setAddon] = useState<{
    active: boolean;
    status: string;
    includedInPlan: boolean;
    amountUsd: number;
    configured: boolean;
    name: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoRecharge, setAutoRecharge] = useState({
    enabled: false,
    thresholdCents: 0,
    amountCents: 0,
    hasPaymentMethod: false,
    hasStripeCustomer: false,
  });
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
    if (typeof infoData.seatCount === "number") {
      setSeats(Math.max(1, infoData.seatCount));
    }
    if (infoData.checkout) {
      setCheckoutReady({
        pro: Boolean(infoData.checkout.pro),
        team: Boolean(infoData.checkout.team),
        agents: Boolean(infoData.checkout.agents),
      });
    }
    if (infoData.addon) setAddon(infoData.addon);
    if (arData && !arData.error) {
      setAutoRecharge(arData);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      setNotice("Subscription updated. Credits from the plan stipend appear after Stripe confirms payment.");
    } else if (params.get("topup") === "success") {
      setNotice("Top-up received. Prepaid credit will show once the payment webhook lands.");
    } else if (params.get("canceled") === "true" || params.get("topup") === "canceled") {
      setNotice("Checkout canceled. No charge was made.");
    }

    loadState().then(() => setLoading(false)).catch(() => setLoading(false));
  }, []);

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

  async function subscribe(planId: string) {
    const plan = ACCOUNT_PLANS.find((p) => p.id === planId);
    if (!plan) return;
    if (planId === "enterprise") {
      window.location.href = plan.href;
      return;
    }

    const isSubscribed =
      info?.subscriptionStatus === "active" || info?.subscriptionStatus === "trialing";
    if (isSubscribed && info?.plan !== planId) {
      await openPortal();
      return;
    }

    setCheckoutLoading(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          seats: planId === "team" ? seats : 1,
        }),
      });
      const data = await res.json();
      if (data.usePortal) {
        await openPortal();
        return;
      }
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Failed to start checkout");
    } catch {
      alert("Checkout failed");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function subscribeAgents() {
    setCheckoutLoading("agents");
    try {
      const res = await fetch("/api/billing/addons/agents", { method: "POST" });
      const data = await res.json();
      if (data.alreadyActive) {
        await loadState();
        return;
      }
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Failed to start Agents checkout");
    } catch {
      alert("Agents checkout failed");
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
        setAutoRecharge((prev) => ({ ...prev, ...data }));
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
  const minTopupUsd = TOPUP_BONUS_MIN_CENTS / 100;

  return (
    <div>
      <PageHeader
        eyebrow="Commercial"
        title="Billing"
        description="Manage subscriptions, prepaid credits, and token-based usage."
      />

      {notice && (
        <div
          className="mb-4 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--paper-2)", color: "var(--ink-2)" }}
        >
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
            <Wallet className="h-4 w-4" />
            <p className="text-sm font-medium">Spendable balance</p>
          </div>
          <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--ink)" }}>
            {centsToUsd(balance?.creditsUsdCents || 0)}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-4)" }}>
            {centsToUsd(balance?.paidCreditsUsdCents || 0)} prepaid
            {(balance?.welcomeCreditsUsdCents || 0) > 0
              ? ` · ${centsToUsd(balance?.welcomeCreditsUsdCents || 0)} open-weight bonus${
                  balance?.welcomeExpiresAt
                    ? ` (expires ${new Date(balance.welcomeExpiresAt).toLocaleDateString()})`
                    : ""
                }`
              : ""}
            .
          </p>
        </div>

        <div className="card p-6">
          <p className="text-sm font-medium" style={{ color: "var(--ink-3)" }}>Current plan</p>
          <p className="mt-2 text-lg font-semibold capitalize" style={{ color: "var(--ink)" }}>
            {info?.plan === "free" ? "Pay as you go" : info?.plan || "Pay as you go"}
          </p>
          <p className="mt-4 text-sm leading-6" style={{ color: "var(--ink-3)" }}>
            No free credit at signup. Top up {formatUsd(TOPUP_BONUS_MIN_CENTS)} or more once and we add $5
            for open-weight models. That bonus cannot start a cloud GPU or
            pay for closed models.
          </p>
        </div>
      </div>

      {info && (
        <div className="mt-4 card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: "var(--ink-3)" }}>Subscription</p>
              <p className="mt-1 text-2xl font-semibold capitalize" style={{ color: "var(--ink)" }}>
                {info.plan === "free" ? "Pay as you go" : info.plan}
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

      {addon && (
        <div className="mt-4 card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
                <Sparkles className="h-4 w-4" />
                <p className="text-sm font-medium">Add-on</p>
              </div>
              <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
                Agents · ${addon.amountUsd}/month
              </p>
              <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--ink-3)" }}>
                Hosted OpenClaw, Hermes, and NemoClaw. Separate from the seat plan.
                Agent tokens still bill prepaid quota.
              </p>
              {addon.includedInPlan ? (
                <span className="badge-success mt-3 inline-block">Included on Enterprise</span>
              ) : addon.active ? (
                <span className="badge-success mt-3 inline-block">{addon.status}</span>
              ) : (
                <span className="badge-neutral mt-3 inline-block">Not subscribed</span>
              )}
            </div>
            {addon.includedInPlan ? null : addon.active ? (
              <button onClick={openPortal} disabled={portalLoading} className="btn-secondary">
                {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Manage add-on
              </button>
            ) : (
              <button
                onClick={subscribeAgents}
                disabled={checkoutLoading === "agents" || !checkoutReady.agents}
                className={checkoutReady.agents ? "btn-primary" : "btn-secondary opacity-60"}
              >
                {checkoutLoading === "agents" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Loading…</>
                ) : checkoutReady.agents ? (
                  `Subscribe · $${addon.amountUsd}/mo`
                ) : (
                  "Not configured"
                )}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 card p-6">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ink-4)" }} />
          <div className="w-full">
            <h3 className="section-title">Top up API credits</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
              Minimum {formatUsd(TOPUP_BONUS_MIN_CENTS)}. The first qualifying top-up adds $5 of open-weight
              credit. We deduct usage automatically per request.
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
                min={minTopupUsd}
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
                    min={minTopupUsd}
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

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {ACCOUNT_PLANS.map((plan) => {
          const isCurrent = info?.plan === plan.id;
          const configured = plan.id === "enterprise" || checkoutReady[plan.id];
          const switching = isSubscribed && !isCurrent && plan.id !== "enterprise";
          return (
            <div
              key={plan.id}
              className={`card p-6 ${isCurrent ? "ring-2 ring-[var(--ink)]" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: "var(--ink)" }}>{plan.name}</h3>
                {isCurrent && <span className="badge-neutral">Current</span>}
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>{plan.tagline}</p>
              <p className="mt-4 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
                ${plan.price}
                <span className="ml-1 text-sm font-normal" style={{ color: "var(--ink-4)" }}>
                  {plan.priceSuffix}
                </span>
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>{plan.included}</p>

              {plan.id === "team" && !isCurrent && !isSubscribed && (
                <label className="mt-4 block text-xs font-medium" style={{ color: "var(--ink-3)" }}>
                  Seats
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={seats}
                    onChange={(e) => setSeats(Math.max(1, Number(e.target.value || 1)))}
                    className="input mt-1 w-full"
                    aria-label="Team seats"
                  />
                </label>
              )}

              <ul className="mt-5 space-y-2.5">
                {plan.inherit ? (
                  <li className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--green)" }} />
                    <span style={{ color: "var(--ink-2)" }}>{plan.inherit}</span>
                  </li>
                ) : null}
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--green)" }} />
                    <span style={{ color: "var(--ink-2)" }}>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => subscribe(plan.id)}
                disabled={
                  isCurrent ||
                  checkoutLoading === plan.id ||
                  portalLoading ||
                  (!configured && plan.id !== "enterprise")
                }
                className={`mt-6 w-full ${isCurrent || !configured ? "btn-secondary opacity-60" : "btn-primary"}`}
              >
                {checkoutLoading === plan.id || (portalLoading && switching) ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Loading…</>
                ) : isCurrent ? (
                  "Current Plan"
                ) : !configured ? (
                  "Not configured"
                ) : switching ? (
                  "Switch in portal"
                ) : (
                  plan.cta
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 card p-6">
        <h3 className="section-title mb-4">Markup by model family</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="table-header-cell">Family</th>
                <th className="table-header-cell">Pay as you go</th>
                <th className="table-header-cell">Pro</th>
                <th className="table-header-cell">Team</th>
                <th className="table-header-cell">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {MARKUP_FAMILIES.map((family) => (
                <tr key={family.id} className="table-row">
                  <td className="table-cell" style={{ color: "var(--ink-2)" }}>{family.label}</td>
                  {MARKUP_COLUMNS.map((planId) => (
                    <td key={planId} className="table-cell" style={{ color: "var(--ink-3)" }}>
                      {PLANS[planId].markupByFamily[family.id]}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
