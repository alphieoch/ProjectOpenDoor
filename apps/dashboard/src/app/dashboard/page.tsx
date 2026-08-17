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
  Activity, CreditCard, Key, TrendingUp, Globe, Sparkles, ArrowRight,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { CopyButton } from "@/components/ui/copy-button";
import { fillDailySeries, deltaLabel } from "@/lib/series";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { models as modelsTable, providers } from "@opendoor/database";

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

  const [stats, keyCount, daily, firstModel] = await Promise.all([
    db.select({
      totalRequests: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`SUM(${requests.totalTokens})`,
      totalCost: sql<number>`SUM(${requests.costUsd})`,
      avgLatency: sql<number>`AVG(${requests.latencyMs})`,
    }).from(requests).where(and(eq(requests.organizationId, orgId), gte(requests.createdAt, since30))),
    db.select({ count: sql<number>`COUNT(*)` }).from(apiKeys).where(eq(apiKeys.organizationId, orgId)),
    db.select({
      day: sql<string>`(${requests.createdAt})::date`,
      requests: sql<number>`COUNT(*)`,
      tokens: sql<number>`COALESCE(SUM(${requests.totalTokens}), 0)`,
      cost: sql<number>`COALESCE(SUM(${requests.costUsd}), 0)`,
      latency: sql<number>`COALESCE(AVG(${requests.latencyMs}), 0)`,
    }).from(requests).where(and(eq(requests.organizationId, orgId), gte(requests.createdAt, since30)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ modelId: modelsTable.modelId })
      .from(modelsTable)
      .innerJoin(providers, eq(modelsTable.providerId, providers.id))
      .where(eq(modelsTable.enabled, true))
      .limit(1),
  ]);

  const stat = stats[0];
  const totalRequests = Number(stat?.totalRequests || 0);
  const totalTokens = Number(stat?.totalTokens || 0);
  const totalCost = Number(stat?.totalCost || 0);
  const avgLatency = Number(stat?.avgLatency || 0);
  const requestSeries = fillDailySeries(daily.map((d) => ({ day: d.day, value: Number(d.requests) })));
  const tokenSeries = fillDailySeries(daily.map((d) => ({ day: d.day, value: Number(d.tokens) })));
  const costSeries = fillDailySeries(daily.map((d) => ({ day: d.day, value: Number(d.cost) })));
  const latencySeries = fillDailySeries(daily.map((d) => ({ day: d.day, value: Number(d.latency) })));
  const mid = 15;
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr: number[]) => (arr.length ? sum(arr) / arr.length : 0);
  const reqDelta = deltaLabel(sum(requestSeries.slice(mid)), sum(requestSeries.slice(0, mid)));
  const tokDelta = deltaLabel(sum(tokenSeries.slice(mid)), sum(tokenSeries.slice(0, mid)));
  const costDelta = deltaLabel(sum(costSeries.slice(mid)), sum(costSeries.slice(0, mid)));
  const latDelta = deltaLabel(avg(latencySeries.slice(mid)), avg(latencySeries.slice(0, mid)), true);

  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
  const gateway = gatewayBaseUrl();
  const sampleModel = firstModel[0]?.modelId || "YOUR_MODEL_ID";
  const snippet = `from openai import OpenAI

client = OpenAI(
  base_url="${gateway}/v1",
  api_key="YOUR_OPENDOOR_KEY"
)
r = client.chat.completions.create(
  model="${sampleModel}",
  messages=[{"role":"user","content":"Hello"}]
)`;

  return (
    <div className="od-page">
      <div className="od-fade-up" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="od-eyebrow">{today}</div>
          <h1 className="od-h1" style={{ marginTop: 12 }}>Welcome back.</h1>
          <h1 className="od-h1-grad" style={{ marginTop: 4, display: "block" }}>How can I help you today?</h1>
        </div>
        <div className="od-fade-up-2" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/dashboard/playground" className="od-btn-pulse" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 999, background: "var(--brand)", color: "white", border: "1px solid var(--brand)", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>
            <Sparkles style={{ width: 14, height: 14 }} /> Open playground
          </Link>
          <Link href="/dashboard/usage" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 999, background: "var(--paper-2)", color: "var(--ink-2)", border: "1px solid var(--line)", fontSize: 13, fontWeight: 500, textDecoration: "none" }} className="od-lift">
            Usage
          </Link>
          <Link href="/dashboard/api-keys" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 999, background: "var(--paper-2)", color: "var(--ink-2)", border: "1px solid var(--line)", fontSize: 13, fontWeight: 500, textDecoration: "none" }} className="od-lift">
            <Key style={{ width: 13, height: 13 }} /> Create API key
          </Link>
        </div>
      </div>

      <div className="od-metric-grid" style={{ marginBottom: 24 }}>
        <MetricCard
          label="Requests"
          icon={<Activity style={{ width: 12, height: 12 }} />}
          value={formatNumber(totalRequests)}
          delta={`${reqDelta.text} vs prior 15d`}
          deltaUp={reqDelta.up}
          series={requestSeries}
          className="od-fade-up-1"
        />
        <MetricCard
          label="Tokens"
          icon={<TrendingUp style={{ width: 12, height: 12 }} />}
          value={formatNumber(totalTokens)}
          delta={`${tokDelta.text} vs prior 15d`}
          deltaUp={tokDelta.up}
          series={tokenSeries}
          className="od-fade-up-2"
        />
        <MetricCard
          label="Spend"
          icon={<CreditCard style={{ width: 12, height: 12 }} />}
          value={formatCurrency(totalCost)}
          delta={`${costDelta.text} vs prior 15d`}
          deltaUp={costDelta.up}
          series={costSeries}
          featured
          className="od-fade-up-3"
        />
        <MetricCard
          label="P50 Latency"
          icon={<Globe style={{ width: 12, height: 12 }} />}
          value={avgLatency > 0 ? `${Math.round(avgLatency)}ms` : "—"}
          delta={`${latDelta.text} vs prior 15d`}
          deltaUp={latDelta.up}
          series={latencySeries}
          className="od-fade-up-4"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
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

        <div className="od-card od-fade-up-4" style={{ padding: "20px 24px" }}>
          <div className="od-eyebrow" style={{ marginBottom: 14 }}>Quick nav</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { href: "/dashboard/models", label: "Model catalog", icon: Sparkles },
              { href: "/dashboard/playground", label: "Playground", icon: Activity },
              { href: "/dashboard/usage", label: "Usage & costs", icon: TrendingUp },
              { href: "/dashboard/logs", label: "Request logs", icon: Activity },
              { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
            ].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10, color: "var(--ink-2)",
                fontSize: 13.5, fontWeight: 500, textDecoration: "none",
                transition: "background 0.16s, transform 0.16s",
              }} className="hover:bg-[var(--paper)] hover:translate-x-0.5">
                <Icon style={{ width: 14, height: 14, color: "var(--ink-3)" }} />
                {label}
                <ArrowRight style={{ width: 12, height: 12, marginLeft: "auto", color: "var(--ink-4)" }} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="od-banner od-fade-up-5">
        <div className="od-banner__shape" />
        <div style={{ position: "relative" }}>
          <div className="od-eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>Quick start</div>
          <h2>Make your first call.</h2>
          <p>Drop the gateway URL in your existing OpenAI client. No SDK changes — just point and go.</p>
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CopyButton value={snippet} label="Copy snippet" className="od-lift" />
            <Link href="/dashboard/models" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 999, background: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.28)", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>
              Browse models <ArrowRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
