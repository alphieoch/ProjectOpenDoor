export const dynamic = "force-dynamic";

import { getDb } from "@/lib/db";
import { requests, apiKeys, organizations } from "@opendoor/database";
import { eq, sql, gte, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import {
  isChecklistComplete,
  normalizeOnboardingSegment,
  parseOnboardingChecklist,
} from "@/lib/onboarding";
import {
  Activity, CreditCard, Key, TrendingUp, Globe, ArrowRight,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { CopyButton } from "@/components/ui/copy-button";
import { fillDailySeries, deltaLabel } from "@/lib/series";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { models as modelsTable, providers } from "@opendoor/database";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  try {
    return await DashboardOverview();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[dashboard] overview unavailable", err);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace stats could not be loaded. Open Studio or another page to keep working.
          </p>
        </div>
      </div>
    );
  }
}

async function DashboardOverview() {
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
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-blue-950 to-blue-900 p-4 text-white sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/70">{today}</p>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">Welcome back.</h1>
        <p className="mt-1 text-sm text-white/80">How can I help you today?</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/dashboard/playground"
            className={cn(buttonVariants({ size: "sm" }), "bg-white text-blue-950 hover:bg-white/90")}
          >
            Open playground
          </Link>
          <Link
            href="/dashboard/usage"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white",
            )}
          >
            Usage
          </Link>
          <Link
            href="/dashboard/api-keys"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white",
            )}
          >
            <Key className="h-3.5 w-3.5" /> Create API key
          </Link>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Requests"
          icon={<Activity className="h-3 w-3" />}
          value={formatNumber(totalRequests)}
          delta={`${reqDelta.text} vs prior 15d`}
          deltaUp={reqDelta.up}
          series={requestSeries}
        />
        <MetricCard
          label="Tokens"
          icon={<TrendingUp className="h-3 w-3" />}
          value={formatNumber(totalTokens)}
          delta={`${tokDelta.text} vs prior 15d`}
          deltaUp={tokDelta.up}
          series={tokenSeries}
        />
        <MetricCard
          label="Spend"
          icon={<CreditCard className="h-3 w-3" />}
          value={formatCurrency(totalCost)}
          delta={`${costDelta.text} vs prior 15d`}
          deltaUp={costDelta.up}
          series={costSeries}
          featured
        />
        <MetricCard
          label="P50 Latency"
          icon={<Globe className="h-3 w-3" />}
          value={avgLatency > 0 ? `${Math.round(avgLatency)}ms` : "—"}
          delta={`${latDelta.text} vs prior 15d`}
          deltaUp={latDelta.up}
          series={latencySeries}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Access</p>
            <CardTitle className="font-sans text-lg">API Keys</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-4xl font-semibold tracking-tight text-foreground">
                {formatNumber(keyCount[0]?.count || 0)}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">active keys</p>
            </div>
            <Link href="/dashboard/api-keys" className={buttonVariants({ size: "sm" })}>
              <Key className="h-3.5 w-3.5" /> Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Quick nav</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-0.5">
            {[
              { href: "/dashboard/models", label: "Model catalog", icon: Activity },
              { href: "/dashboard/playground", label: "Playground", icon: Activity },
              { href: "/dashboard/usage", label: "Usage & costs", icon: TrendingUp },
              { href: "/dashboard/logs", label: "Request logs", icon: Activity },
              { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                <ArrowRight className="ml-auto h-3 w-3 opacity-50" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Quick start</p>
          <CardTitle className="font-sans text-lg">Make your first call.</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Drop the gateway URL in your existing OpenAI client. No SDK changes — just point and go.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton value={snippet} label="Copy snippet" />
            <Link href="/dashboard/models" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Browse models <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
