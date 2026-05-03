export const dynamic = "force-dynamic";

import { getDb } from "@/lib/db";
import { requests, apiKeys, organizations } from "@opendoor/database";
import { eq, sql, gte, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { formatCurrency, formatNumber } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isChecklistComplete,
  normalizeOnboardingSegment,
  parseOnboardingChecklist,
} from "@/lib/onboarding";
import {
  Activity, CreditCard, Key, TrendingUp, Globe, Sparkles, Copy,
  RotateCcw, Plug, Download, ArrowRight,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const db = getDb();

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      onboardingSegment: true,
      metadata: true,
    },
  });
  const segment = normalizeOnboardingSegment(org?.onboardingSegment);
  const metadata = (org?.metadata as Record<string, unknown> | null) || {};
  const checklist = parseOnboardingChecklist(metadata.onboarding_checklist);

  if (!isChecklistComplete(segment, checklist)) {
    redirect("/dashboard/onboarding");
  }

  const [stats, keyCount] = await Promise.all([
    db.select({
      totalRequests: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`SUM(${requests.totalTokens})`,
      totalCost: sql<number>`SUM(${requests.costUsd})`,
      avgLatency: sql<number>`AVG(${requests.latencyMs})`,
    }).from(requests).where(and(eq(requests.organizationId, orgId), gte(requests.createdAt, since30))),
    db.select({ count: sql<number>`COUNT(*)` }).from(apiKeys).where(eq(apiKeys.organizationId, orgId)),
  ]);

  const stat = stats[0];
  const totalRequests = Number(stat?.totalRequests || 0);
  const totalTokens = Number(stat?.totalTokens || 0);
  const totalCost = Number(stat?.totalCost || 0);
  const avgLatency = Number(stat?.avgLatency || 0);

  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });

  return (
    <div>
      {/* Page header */}
      <div className="od-fade-up" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="od-eyebrow">{today}</div>
          <h1 className="od-h1" style={{ marginTop: 12 }}>Welcome back.</h1>
          <h1 className="od-h1-grad" style={{ marginTop: 4, display: "block" }}>How can I help you today?</h1>
        </div>
        <div className="od-fade-up-2" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="od-btn-pulse" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 999, background: "var(--brand)", color: "white", border: "1px solid var(--brand)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            <Sparkles style={{ width: 14, height: 14 }} /> Ask AI
          </button>
          <Link href="/dashboard/usage" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 999, background: "var(--paper-2)", color: "var(--ink-2)", border: "1px solid var(--line)", fontSize: 13, fontWeight: 500, textDecoration: "none", transition: "all 0.12s" }} className="hover:border-[var(--ink-4)] od-lift">
            Usage updates
          </Link>
          <Link href="/dashboard/api-keys" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 999, background: "var(--paper-2)", color: "var(--ink-2)", border: "1px solid var(--line)", fontSize: 13, fontWeight: 500, textDecoration: "none", transition: "all 0.12s" }} className="hover:border-[var(--ink-4)] od-lift">
            <Key style={{ width: 13, height: 13 }} /> Create API key
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard
          label="Requests" icon={<Activity style={{ width: 12, height: 12 }} />}
          value={formatNumber(totalRequests)} delta="+18.4%" deltaUp
          className="od-fade-up-1"
        />
        <StatCard
          label="Tokens" icon={<TrendingUp style={{ width: 12, height: 12 }} />}
          value={formatNumber(totalTokens)} delta="+21.7%" deltaUp
          className="od-fade-up-2"
        />
        <StatCard
          label="Spend" icon={<CreditCard style={{ width: 12, height: 12 }} />}
          value={formatCurrency(totalCost)} delta="+14.2%" deltaUp
          gradient
          className="od-fade-up-3"
        />
        <StatCard
          label="P50 Latency" icon={<Globe style={{ width: 12, height: 12 }} />}
          value={avgLatency > 0 ? `${Math.round(avgLatency)}ms` : "—"} delta="−3.8% faster" deltaUp
          className="od-fade-up-4"
        />
      </div>

      {/* Bottom row: quick start + API keys */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* API Keys summary */}
        <div className="od-card od-fade-up-3">
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
            <div className="od-eyebrow">Access</div>
            <h2 className="od-h2" style={{ marginTop: 4 }}>API Keys</h2>
          </div>
          <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 44, lineHeight: 1, color: "var(--ink)", letterSpacing: "-0.02em" }}>{formatNumber(keyCount[0]?.count || 0)}</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4, fontFamily: "var(--font-mono)" }}>active keys</span>
            </div>
            <Link href="/dashboard/api-keys" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 999, background: "var(--brand)", color: "white", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>
              <Key style={{ width: 13, height: 13 }} /> Manage <ArrowRight style={{ width: 12, height: 12 }} />
            </Link>
          </div>
        </div>

        {/* Quick links */}
        <div className="od-card od-fade-up-4" style={{ padding: "20px 24px" }}>
          <div className="od-eyebrow" style={{ marginBottom: 14 }}>Quick nav</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { href: "/dashboard/usage", label: "Usage & Costs", icon: TrendingUp },
              { href: "/dashboard/playground", label: "Playground", icon: Activity },
              { href: "/dashboard/governance", label: "Trust Center", icon: Key },
              { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
            ].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8, color: "var(--ink-2)",
                fontSize: 13.5, fontWeight: 500, textDecoration: "none",
                transition: "background 0.12s",
              }} className="hover:bg-[var(--paper)]">
                <Icon style={{ width: 14, height: 14, color: "var(--ink-3)" }} />
                {label}
                <ArrowRight style={{ width: 12, height: 12, marginLeft: "auto", color: "var(--ink-4)" }} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Quick start banner */}
      <div className="od-banner od-fade-up-5">
        <div className="od-banner__shape" />
        <div style={{ position: "relative" }}>
          <div className="od-eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>Quick start</div>
          <h2>Make your first call.</h2>
          <p>Drop the gateway URL in your existing OpenAI client. No SDK changes — just point and go.</p>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button className="od-lift" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 999, background: "white", color: "var(--ink)", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              <Copy style={{ width: 13, height: 13 }} /> Copy snippet
            </button>
            <Link href="/dashboard/api-keys" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 999, background: "transparent", color: "white", border: "none", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>
              Read docs <ArrowRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>
        </div>
      </div>

      {/* FAB */}
      <button className="od-fab" title="Ask AI">
        <Sparkles style={{ width: 20, height: 20 }} />
      </button>
    </div>
  );
}

function StatCard({
  label, icon, value, delta, deltaUp, gradient, className,
}: {
  label: string; icon: React.ReactNode; value: string;
  delta: string; deltaUp: boolean; gradient?: boolean; className?: string;
}) {
  return (
    <div
      className={`od-numberblock od-lift ${className || ""}`}
      style={gradient ? { background: "linear-gradient(135deg, #1A1A2E 0%, #5B3DE0 100%)", border: "none" } : {}}
    >
      <div className="od-numberblock__label" style={gradient ? { color: "rgba(255,255,255,0.6)" } : {}}>
        {icon} {label}
      </div>
      <div className="od-display" style={{ fontSize: 44, ...(gradient ? { color: "white" } : {}) }}>
        {value}
      </div>
      <div className={deltaUp ? "od-numberblock__delta-up" : "od-numberblock__delta-down"} style={gradient ? { color: "#1FD1A3" } : {}}>
        {deltaUp ? "↑" : "↓"} {delta}
      </div>
    </div>
  );
}
