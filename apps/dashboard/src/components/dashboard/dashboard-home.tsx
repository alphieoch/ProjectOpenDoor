import {
  Activity,
  ArrowRight,
  Bot,
  CreditCard,
  Globe,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { models as modelsTable, providers, requests } from "@opendoor/database";
import { and, eq, gte, sql } from "drizzle-orm";
import { MotionPress, Stagger, StaggerItem } from "@/components/motion";
import { MetricCard } from "@/components/ui/metric-card";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GettingStartedCard, NextActionCard } from "@/components/dashboard/getting-started";
import { RecentActivityCard } from "@/components/dashboard/recent-activity";
import { SnapCarousel, snapCarouselItemClassName } from "@/components/dashboard/snap-carousel";
import { loadRecentAccountActivity } from "@/lib/account-activity-load";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { loadOnboardingHome, type RecentAgent } from "@/lib/onboarding-progress";
import {
  developerStepHref,
  GETTING_STARTED_CATALOG,
  shouldShowGettingStarted,
} from "@/lib/onboarding";
import { fillDailySeries, deltaLabel } from "@/lib/series";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { isLeaderbotName } from "@/lib/openbot-leader";
import { isHouseRunning, partitionAgentRuntimes } from "@/lib/openbot-house";

export async function DashboardHome() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const db = getDb();

  const [onboarding, stats, daily, firstModel, recentActivity] = await Promise.all([
    loadOnboardingHome(orgId, { isSiteAdmin: session.isSiteAdmin }),
    db
      .select({
        totalRequests: sql<number>`COUNT(*)`,
        totalTokens: sql<number>`SUM(${requests.totalTokens})`,
        totalCost: sql<number>`SUM(${requests.costUsd})`,
        avgLatency: sql<number>`AVG(${requests.latencyMs})`,
      })
      .from(requests)
      .where(and(eq(requests.organizationId, orgId), gte(requests.createdAt, since30)))
      .catch(() => [
        { totalRequests: 0, totalTokens: 0, totalCost: 0, avgLatency: 0 },
      ]),
    db
      .select({
        day: sql<string>`(${requests.createdAt})::date`,
        requests: sql<number>`COUNT(*)`,
        tokens: sql<number>`COALESCE(SUM(${requests.totalTokens}), 0)`,
        cost: sql<number>`COALESCE(SUM(${requests.costUsd}), 0)`,
        latency: sql<number>`COALESCE(AVG(${requests.latencyMs}), 0)`,
      })
      .from(requests)
      .where(and(eq(requests.organizationId, orgId), gte(requests.createdAt, since30)))
      .groupBy(sql`1`)
      .orderBy(sql`1`)
      .catch(() => []),
    db
      .select({ modelId: modelsTable.modelId })
      .from(modelsTable)
      .innerJoin(providers, eq(modelsTable.providerId, providers.id))
      .where(eq(modelsTable.enabled, true))
      .limit(1)
      .catch(() => []),
    loadRecentAccountActivity(orgId),
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

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
  });
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

  const { progress, evidence, recentAgents, world } = onboarding;
  const showGettingStarted = shouldShowGettingStarted(progress, evidence);
  const nextStep = progress.nextStepId ? GETTING_STARTED_CATALOG[progress.nextStepId] : null;
  const emptyActivityAction = nextStep
    ? {
        href: progress.nextStepId === "developer" ? developerStepHref(evidence) : nextStep.href,
        label: nextStep.cta,
        description: nextStep.description,
      }
    : {
        href: "/dashboard/chat",
        label: "Open Chat",
        description: "Send a message so this account has something to track.",
      };

  return (
    <Stagger className="space-y-6" appear="settle">
      <StaggerItem appear="settle">
      {showGettingStarted ? (
        <GettingStartedCard
          progress={progress}
          evidence={evidence}
          needsRegion={!world.region}
        />
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-6">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {today}
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Welcome back.</h1>
          <p className="mt-1 text-sm text-muted-foreground">How can I help you today?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <MotionPress>
              <Link href="/dashboard/chat" className={buttonVariants({ size: "sm" })}>
                Open Chat
              </Link>
            </MotionPress>
            <MotionPress>
              <Link
                href="/dashboard/openbot"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                OpenBot
              </Link>
            </MotionPress>
            <MotionPress>
              <Link
                href="/dashboard/usage"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                Usage
              </Link>
            </MotionPress>
          </div>
        </section>
      )}
      </StaggerItem>

      <StaggerItem appear="settle">
      <SnapCarousel
        ariaLabel="Usage overview"
        prevLabel="Previous usage metrics"
        nextLabel="Next usage metrics"
      >
        <div data-carousel-card className={snapCarouselItemClassName}>
          <MetricCard
            className="h-full"
            label="Requests"
            icon={<Activity className="h-3 w-3" />}
            value={totalRequests > 0 ? formatNumber(totalRequests) : "0"}
            delta={totalRequests > 0 ? `${reqDelta.text} vs prior 15d` : "No usage in the last 30 days"}
            deltaUp={reqDelta.up}
            series={requestSeries}
          />
        </div>
        <div data-carousel-card className={snapCarouselItemClassName}>
          <MetricCard
            className="h-full"
            label="Tokens"
            icon={<TrendingUp className="h-3 w-3" />}
            value={totalTokens > 0 ? formatNumber(totalTokens) : "0"}
            delta={totalTokens > 0 ? `${tokDelta.text} vs prior 15d` : "Chat and OpenBot will show up here"}
            deltaUp={tokDelta.up}
            series={tokenSeries}
          />
        </div>
        <div data-carousel-card className={snapCarouselItemClassName}>
          <MetricCard
            className="h-full"
            label="Spend"
            icon={<CreditCard className="h-3 w-3" />}
            value={formatCurrency(totalCost)}
            delta={totalCost > 0 ? `${costDelta.text} vs prior 15d` : "No billed usage yet"}
            deltaUp={costDelta.up}
            series={costSeries}
            featured
          />
        </div>
        <div data-carousel-card className={snapCarouselItemClassName}>
          <MetricCard
            className="h-full"
            label="P50 Latency"
            icon={<Globe className="h-3 w-3" />}
            value={avgLatency > 0 ? `${Math.round(avgLatency)}ms` : "—"}
            delta={avgLatency > 0 ? `${latDelta.text} vs prior 15d` : "Waiting on the first request"}
            deltaUp={latDelta.up}
            series={latencySeries}
          />
        </div>
      </SnapCarousel>
      </StaggerItem>

      <StaggerItem appear="settle">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Coworkers
            </p>
            <CardTitle className="font-sans text-lg">Recent agents</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAgents.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No coworkers yet. Open OpenBot to bring the first one online.
                </p>
                <Link href="/dashboard/openbot" className={buttonVariants({ size: "sm" })}>
                  <Bot className="h-3.5 w-3.5" />
                  Open OpenBot
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <RecentCoworkers agents={recentAgents} />
            )}
          </CardContent>
        </Card>

        <NextActionCard progress={progress} evidence={evidence} />
      </div>
      </StaggerItem>

      <StaggerItem appear="settle">
      <RecentActivityCard items={recentActivity} emptyAction={emptyActivityAction} />
      </StaggerItem>

      <StaggerItem appear="settle">
      <Card>
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Developer
          </p>
          <CardTitle className="font-sans text-lg">Gateway snippet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Optional — point an OpenAI-compatible client at the gateway when you need an API.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton value={snippet} label="Copy snippet" />
            <Link href="/dashboard/models" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Browse models <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>
      </StaggerItem>
    </Stagger>
  );
}

function RecentCoworkers({ agents }: { agents: RecentAgent[] }) {
  const { house, others } = partitionAgentRuntimes(agents);
  const leader = house.find((agent) => isLeaderbotName(agent.name));
  const members = house.filter((agent) => !isLeaderbotName(agent.name));
  const houseHref = leader?.href || house[0]?.href || "/dashboard/openbot";
  const houseRunning = house.filter((agent) => isHouseRunning(agent.status)).length;
  const memberNames = members.map((agent) => agent.name).join(", ");

  return (
    <div className="flex flex-col gap-0.5">
      {house.length > 0 ? (
        <Link
          href={houseHref}
          className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">OpenBot house</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {leader?.name || "Leaderbot"}
              {memberNames ? ` · ${memberNames}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs capitalize text-muted-foreground">
            {houseRunning > 0 ? `${houseRunning} running` : house[0]?.status}
          </span>
        </Link>
      ) : null}
      {others.slice(0, 3).map((agent) => (
        <Link
          key={agent.id}
          href={agent.href}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bot className="h-3.5 w-3.5" />
          <span className="min-w-0 truncate">{agent.name}</span>
          <span className="ml-auto text-xs capitalize text-muted-foreground">{agent.status}</span>
        </Link>
      ))}
    </div>
  );
}
