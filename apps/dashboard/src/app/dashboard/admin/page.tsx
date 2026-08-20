export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  Building2,
  ClipboardList,
  Coins,
  FlaskConical,
  GitBranch,
  Server,
  Users,
} from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { requireSiteAdminOrNotFound } from "@/lib/auth";
import { loadAdminOverview } from "@/lib/admin/overview-load";
import { errorRatePct, formatUsdCompact } from "@/lib/admin/overview";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { SnapCarousel, snapCarouselItemClassName } from "@/components/dashboard/snap-carousel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

function healthLabel(status: string) {
  if (status === "up") return "Up";
  if (status === "down") return "Down";
  return "Unknown";
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SiteAdminOverviewPage() {
  await requireSiteAdminOrNotFound();

  try {
    const overview = await loadAdminOverview();
    const { traffic, programs, health, recentFailures, recentAudit, posthogUrl } = overview;
    const err24 = errorRatePct(traffic.last24h.errors, traffic.last24h.requests);
    const err7 = errorRatePct(traffic.last7d.errors, traffic.last7d.requests);
    const planEntries = Object.entries(programs.orgsByPlan).sort((a, b) => b[1] - a[1]);

    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Site admin"
          title="Platform overview"
          description="Live counts from Postgres and a gateway health probe. Not a marketing mock."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/orgs" className={buttonVariants({ size: "sm", variant: "outline" })}>
                Organizations
              </Link>
              <Link href="/admin/users" className={buttonVariants({ size: "sm", variant: "outline" })}>
                Users
              </Link>
              <Link href="/admin/credits" className={buttonVariants({ size: "sm", variant: "outline" })}>
                Credits
              </Link>
              <Link href="/admin/audit-logs" className={buttonVariants({ size: "sm", variant: "outline" })}>
                Audit trail
              </Link>
              {posthogUrl ? (
                <a
                  href={posthogUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  PostHog
                </a>
              ) : null}
            </div>
          }
        />

        <SnapCarousel
          ariaLabel="Platform traffic"
          prevLabel="Previous traffic metrics"
          nextLabel="Next traffic metrics"
        >
          <div data-carousel-card className={snapCarouselItemClassName}>
            <MetricCard
              className="h-full"
              label="Requests · 24h"
              icon={<Activity className="h-3 w-3" />}
              value={formatNumber(traffic.last24h.requests)}
              delta={`${formatNumber(traffic.last7d.requests)} in 7d`}
              series={traffic.requestSeries}
            />
          </div>
          <div data-carousel-card className={snapCarouselItemClassName}>
            <MetricCard
              className="h-full"
              label="Errors · 24h"
              icon={<AlertTriangle className="h-3 w-3" />}
              value={formatNumber(traffic.last24h.errors)}
              delta={`${err24}% of 24h · ${err7}% of 7d`}
              deltaUp={err24 === 0}
              series={traffic.errorSeries}
            />
          </div>
          <div data-carousel-card className={snapCarouselItemClassName}>
            <MetricCard
              className="h-full"
              label="Avg latency · 24h"
              icon={<Activity className="h-3 w-3" />}
              value={
                traffic.last24h.avgLatencyMs > 0
                  ? `${Math.round(traffic.last24h.avgLatencyMs)}ms`
                  : "—"
              }
              delta={
                traffic.last7d.avgLatencyMs > 0
                  ? `${Math.round(traffic.last7d.avgLatencyMs)}ms over 7d`
                  : "Waiting on traffic"
              }
            />
          </div>
          <div data-carousel-card className={snapCarouselItemClassName}>
            <MetricCard
              className="h-full"
              label="Metered spend · 7d"
              icon={<Coins className="h-3 w-3" />}
              value={formatUsdCompact(traffic.last7d.costUsd)}
              delta={`${formatUsdCompact(traffic.last24h.costUsd)} last 24h`}
              featured
            />
          </div>
        </SnapCarousel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Programs
              </p>
              <CardTitle className="font-sans text-lg">What is running</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <ProgramStat icon={Building2} label="Organizations" value={programs.orgs} href="/admin/orgs" />
                <ProgramStat icon={Users} label="Users" value={programs.users} href="/admin/users" detail={`${programs.siteAdmins} site admins`} />
                <ProgramStat icon={Bot} label="OpenBot agents" value={programs.agents} href="/dashboard/openbot" detail={`${programs.agentsRunning} running`} />
                <ProgramStat icon={FlaskConical} label="Training jobs" value={programs.trainingJobs} href="/dashboard/training" detail={`${programs.trainingActive} active`} />
                <ProgramStat icon={GitBranch} label="Workflows" value={programs.workflows} href="/dashboard/workflow" detail={`${programs.workflowsActive} active`} />
                <ProgramStat icon={Server} label="Deployments" value={programs.deployments} href="/dashboard/deployments" detail={`${programs.deploymentsRunning} running`} />
              </div>
              {planEntries.length > 0 ? (
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Plans
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {planEntries.map(([plan, count]) => (
                      <li
                        key={plan}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                      >
                        {plan} · {formatNumber(count)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Health
              </p>
              <CardTitle className="font-sans text-lg">Gateway and wallets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <HealthRow label="Gateway" value={healthLabel(health.gatewayStatus)} ok={health.gatewayStatus === "up"} />
                <HealthRow
                  label="Gateway RTT"
                  value={health.gatewayLatencyMs != null ? `${health.gatewayLatencyMs}ms` : "—"}
                  ok={health.gatewayStatus === "up"}
                />
                <HealthRow label="Database" value={healthLabel(health.databaseStatus)} ok={health.databaseStatus === "up"} />
                <HealthRow label="Redis" value={healthLabel(health.redisStatus)} ok={health.redisStatus === "up"} />
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-muted-foreground">Org wallet balance (credits on hand)</p>
                <p className="mt-1 text-lg font-semibold">{formatUsdCompact(health.walletUsd)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Credit inflows last 7d · {formatUsdCompact(health.creditInflowUsd)} · probe {health.source}
                </p>
              </div>
              <Link href="/status" className="text-xs font-medium text-foreground underline-offset-2 hover:underline">
                Public status page
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Failures
              </p>
              <CardTitle className="font-sans text-lg">Recent request errors</CardTitle>
            </CardHeader>
            <CardContent>
              {recentFailures.length === 0 ? (
                <p className="text-sm text-muted-foreground">No request errors in the last 7 days.</p>
              ) : (
                <ul className="space-y-2">
                  {recentFailures.map((row) => (
                    <li key={row.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{row.modelId}</span>
                        <span className="text-xs text-muted-foreground">{when(row.createdAt)}</span>
                      </div>
                      <p className="mt-1 truncate text-muted-foreground">
                        {row.orgName || "Unknown org"}
                        {row.errorMessage ? ` · ${row.errorMessage}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/dashboard/logs"
                className="mt-3 inline-block text-xs font-medium text-foreground underline-offset-2 hover:underline"
              >
                Request logs
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Audit
              </p>
              <CardTitle className="font-sans text-lg">Recent admin actions</CardTitle>
            </CardHeader>
            <CardContent>
              {recentAudit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No audit events yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recentAudit.map((row) => (
                    <li key={row.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{row.action}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.userEmail || "system"}
                          {row.orgName ? ` · ${row.orgName}` : ""}
                          {row.entityType ? ` · ${row.entityType}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{when(row.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/admin/audit-logs"
                className="mt-3 inline-block text-xs font-medium text-foreground underline-offset-2 hover:underline"
              >
                Full audit trail
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    unstable_rethrow(err);
    console.error("[admin overview] unavailable", err);
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Platform stats could not be loaded. Organizations, users, and credits are still available.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/orgs" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Organizations
          </Link>
          <Link href="/admin/users" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Users
          </Link>
          <Link href="/admin/credits" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Credits
          </Link>
        </div>
      </div>
    );
  }
}

function ProgramStat({
  icon: Icon,
  label,
  value,
  detail,
  href,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  detail?: string;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold">{formatNumber(value)}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </Link>
  );
}

function HealthRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium ${ok ? "text-foreground" : "text-muted-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
