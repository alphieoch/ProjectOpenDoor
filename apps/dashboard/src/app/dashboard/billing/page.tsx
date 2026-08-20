"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ENTERPRISE_SALES_HREF,
  isWorkspaceUnpaid,
  resolveCheckoutRequest,
} from "@/lib/signup-plan";
import { CreditCard, ExternalLink, Loader2, Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { formatUsdCents, formatBalanceLabel, unlimitedReasonLabel } from "@/lib/usage-format";
import {
  SEARCH_QUERY_LIST_CENTS,
  WEB_SEARCH_ADDON,
  formatPlanPriceUsd,
  formatUsdCents as formatCatalogUsd,
  getPlan,
} from "@opendoor/shared";

const TOPUPS = [2000, 5000, 10000, 20000] as const;
const CHECKOUT_PLANS = ["student", "pro", "ultra", "family", "family_max", "team"] as const;

type Balance = {
  plan: string;
  planName: string;
  unlimited: boolean;
  unlimitedReason: "site_admin" | "plan" | null;
  creditsUsdCents: number;
  includedQuotaCents: number;
  prepaidCreditsUsdCents: number;
  includedMonthlyCents: number;
  welcomeCreditsUsdCents: number;
  cutOff: boolean;
  recentTransactions: Array<{
    id: string;
    kind: string;
    amountCents: number;
    balanceAfterCents: number;
    createdAt: string;
  }>;
};

type BillingInfo = {
  org: {
    plan: string;
    planName?: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    subscriptionStatus: string | null;
  };
  unlimited: boolean;
  unlimitedReason: "site_admin" | "plan" | null;
  seatCount: number;
  checkout: Record<string, boolean>;
  webSearchAddon?: {
    active: boolean;
    includedInPlan?: boolean;
    amountUsd: number;
    configured: boolean;
    name: string;
    status?: string;
  };
};

function kindLabel(kind: string) {
  if (kind === "usage") return "Usage";
  if (kind === "plan_grant") return "Included stipend";
  if (kind === "topup" || kind === "top_up") return "Top-up";
  if (kind === "welcome_expire") return "Welcome credit expired";
  return kind.replace(/_/g, " ");
}

function BillingPageInner() {
  const searchParams = useSearchParams();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [searchAddonLoading, setSearchAddonLoading] = useState(false);
  const [topupLoading, setTopupLoading] = useState<number | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [teamSeats, setTeamSeats] = useState(1);
  const autoCheckoutRef = useRef<string | null>(null);

  const notice = useMemo(() => {
    if (searchParams?.get("success") === "true") return "Checkout complete. Stripe will update this plan shortly.";
    if (searchParams?.get("canceled") === "true") return "Checkout canceled. Nothing was charged.";
    if (searchParams?.get("topup") === "success") return "Top-up received. Credits appear after the Stripe webhook.";
    if (searchParams?.get("topup") === "canceled") return "Top-up canceled. Nothing was charged.";
    return null;
  }, [searchParams]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [balanceRes, infoRes] = await Promise.all([
        fetch("/api/billing/balance", { credentials: "include" }),
        fetch("/api/billing/info", { credentials: "include" }),
      ]);
      const balanceData = await balanceRes.json().catch(() => ({}));
      const infoData = await infoRes.json().catch(() => ({}));
      if (!balanceRes.ok) {
        setError(balanceData.error || "Failed to load billing balance.");
        setBalance(null);
      } else {
        setBalance(balanceData);
      }
      if (!infoRes.ok) {
        setError((prev) => prev || infoData.error || "Failed to load billing info.");
        setInfo(null);
      } else {
        setInfo(infoData);
      }
    } catch {
      setError("Failed to load billing.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const requested = searchParams?.get("checkout");
    if (!requested || loading || !info) return;
    if (autoCheckoutRef.current === requested) return;
    const decision = resolveCheckoutRequest({ planId: requested });
    if (!decision.ok) {
      autoCheckoutRef.current = requested;
      setError(
        decision.sales
          ? `${decision.error}. Talk to sales instead of Stripe checkout.`
          : decision.error
      );
      return;
    }
    if (!isWorkspaceUnpaid(info.org)) {
      autoCheckoutRef.current = requested;
      return;
    }
    autoCheckoutRef.current = requested;
    void checkoutPlan(decision.plan);
  }, [info, loading, searchParams]);

  async function checkoutPlan(planId: string) {
    setCheckoutLoading(planId);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          seats: getPlan(planId).perSeat ? teamSeats : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.usePortal) {
        await openPortal();
        return;
      }
      setError(data.error || "Checkout is not configured for this plan.");
    } catch {
      setError("Failed to start checkout.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function topup(amountCents: number) {
    setTopupLoading(amountCents);
    setError(null);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Top-up checkout is not configured.");
    } catch {
      setError("Failed to start top-up.");
    } finally {
      setTopupLoading(null);
    }
  }

  async function subscribeSearchAddon() {
    setSearchAddonLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/addons/web-search", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.alreadyActive) {
        await load();
        return;
      }
      setError(data.error || "Web Search add-on checkout is not configured.");
    } catch {
      setError("Failed to start Web Search checkout.");
    } finally {
      setSearchAddonLoading(false);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "No Stripe customer yet. Start a plan or top-up first.");
    } catch {
      setError("Failed to open the Stripe portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  const unlimited = Boolean(balance?.unlimited || info?.unlimited);
  const planId = balance?.plan || info?.org.plan || "free";
  const planName = balance?.planName || info?.org.planName || getPlan(planId).name;
  const transactions = balance?.recentTransactions || [];

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Billing"
        description="Plan, included stipend, prepaid credits, and Stripe invoices for this workspace."
        actions={
          <Link href="/dashboard/usage" className="btn-secondary">
            Usage
          </Link>
        }
      />

      {notice && (
        <div className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-6 alert-error">
          <p className="font-medium">{error}</p>
          {error.toLowerCase().includes("sales") ? (
            <a href={ENTERPRISE_SALES_HREF} className="mt-2 inline-block text-sm underline">
              Email sales@opendoor.ai
            </a>
          ) : null}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {unlimited && (
            <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
              {unlimitedReasonLabel(balance?.unlimitedReason || info?.unlimitedReason)}
            </div>
          )}

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Plan" value={planName} />
            <MetricCard
              label={unlimited ? "Spendable balance" : "Credits"}
              value={formatBalanceLabel({
                unlimited,
                cents: balance?.creditsUsdCents ?? 0,
              })}
              featured
            />
            <MetricCard
              label="Included left this month"
              value={
                unlimited
                  ? "Unlimited"
                  : formatUsdCents(balance?.includedQuotaCents ?? 0)
              }
            />
          </div>

          <div className="mb-8 grid gap-3 sm:grid-cols-3">
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prepaid</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {unlimited ? "Unlimited" : formatUsdCents(balance?.prepaidCreditsUsdCents ?? 0)}
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Monthly stipend</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {formatUsdCents(balance?.includedMonthlyCents ?? 0)}
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
              <p className="mt-2 text-2xl font-semibold">
                {unlimited ? "Not cut off" : balance?.cutOff ? "Cut off" : info?.org.subscriptionStatus || "Active"}
              </p>
              {balance?.cutOff && !unlimited ? (
                <p className="mt-1 text-xs text-muted-foreground">Top up to resume closed-model inference.</p>
              ) : null}
            </div>
          </div>

          <div className="mb-8 card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="section-title">Top up prepaid credit</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Stripe Checkout. Minimum $20. First $20+ top-up adds $5 open-weight credit.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-2"
                onClick={() => void openPortal()}
                disabled={portalLoading}
              >
                {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Stripe portal
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {TOPUPS.map((cents) => (
                <button
                  key={cents}
                  type="button"
                  className="btn-secondary"
                  disabled={topupLoading === cents}
                  onClick={() => void topup(cents)}
                >
                  {topupLoading === cents ? <Loader2 className="h-4 w-4 animate-spin" /> : `+${formatUsdCents(cents)}`}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8 card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="section-title">OpenDoor Search</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Metered at {formatCatalogUsd(SEARCH_QUERY_LIST_CENTS)} / query on plan credits.
                  The {WEB_SEARCH_ADDON.name} add-on (${WEB_SEARCH_ADDON.amountUsd}/month) covers
                  Search for the month. Visible on Tools — enable to use. Site admins are unlimited.
                </p>
                <p className="mt-2 text-sm text-foreground">
                  {info?.webSearchAddon?.includedInPlan
                    ? "Included on Enterprise."
                    : info?.webSearchAddon?.active
                      ? "Add-on is active — queries are covered this month."
                      : `Usage-based · ${formatCatalogUsd(SEARCH_QUERY_LIST_CENTS)} / query, or subscribe.`}
                </p>
              </div>
              {!info?.webSearchAddon?.active && !unlimited ? (
                <button
                  type="button"
                  className="btn-primary shrink-0"
                  disabled={searchAddonLoading || info?.checkout.webSearch === false}
                  onClick={() => void subscribeSearchAddon()}
                >
                  {searchAddonLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : info?.checkout.webSearch === false ? (
                    "Checkout not configured"
                  ) : (
                    `Subscribe · $${WEB_SEARCH_ADDON.amountUsd}/mo`
                  )}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mb-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="section-title">Change plan</h2>
              <label className="text-xs text-muted-foreground">
                Team seats
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={teamSeats}
                  onChange={(e) => setTeamSeats(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="input ml-2 w-20"
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {CHECKOUT_PLANS.map((id) => {
                const plan = getPlan(id);
                const current = planId === id;
                const configured = Boolean(info?.checkout?.[id]);
                return (
                  <div key={id} className="card flex flex-col p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-foreground">{plan.name}</h3>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {formatPlanPriceUsd(plan.amountUsd)}
                        {plan.perSeat ? "/seat" : ""}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatUsdCents(plan.includedCreditsCents)} included each month
                      {plan.maxSeats ? ` · ${plan.maxSeats} seats` : ""}
                    </p>
                    <button
                      type="button"
                      className="btn-primary mt-4"
                      disabled={current || checkoutLoading === id || (!configured && !current)}
                      onClick={() => void checkoutPlan(id)}
                    >
                      {checkoutLoading === id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : current ? (
                        "Current plan"
                      ) : configured ? (
                        `Select ${plan.name}`
                      ) : (
                        "Not configured"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="section-title inline-flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Recent credit activity
              </h2>
            </div>
            {transactions.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <CreditCard className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No credit activity yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Top up or run a playground request and the ledger will show here.
                </p>
                <Link href="/dashboard/playground" className="btn-secondary mt-4 inline-flex">
                  Open playground
                </Link>
              </div>
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="table-header-cell">When</th>
                    <th className="table-header-cell">Kind</th>
                    <th className="table-header-cell text-right">Amount</th>
                    <th className="table-header-cell text-right">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((row) => (
                    <tr key={row.id} className="table-row">
                      <td className="table-cell text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="table-cell">{kindLabel(row.kind)}</td>
                      <td className="table-cell text-right tabular-nums">
                        {row.amountCents > 0 ? "+" : ""}
                        {formatUsdCents(row.amountCents)}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {formatUsdCents(row.balanceAfterCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BillingPageInner />
    </Suspense>
  );
}
