import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  CreditCard,
  DoorOpen,
  KeyRound,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiKeys, organizations } from "@opendoor/database";
import { eq, sql } from "drizzle-orm";
import { OnboardingSidebar } from "@/components/ui/onboarding-sidebar";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login?signup=1");

  const db = getDb();
  const [org, keyCountResult] = await Promise.all([
    db.query.organizations.findFirst({
      where: eq(organizations.id, session.orgId),
    }),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, session.orgId)),
  ]);

  const keyCount = Number(keyCountResult[0]?.count || 0);
  const credits = Number(org?.creditsUsdCents || 0) / 100;
  const completedSteps = [
    true,
    keyCount > 0,
    (org?.plan || "free") !== "free",
  ].filter(Boolean).length;

  return (
    <div className="flex h-screen overflow-hidden">
      <OnboardingSidebar
        orgName={org?.name ?? "Your workspace"}
        userEmail={session.email}
        completedSteps={completedSteps}
      />
    <main className="ml-[3.05rem] flex-1 overflow-auto relative bg-[#06111f] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-12rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-blue-500/25 blur-3xl" />
        <div className="absolute right-[-10rem] top-24 h-[30rem] w-[30rem] rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute bottom-[-16rem] left-1/3 h-[34rem] w-[34rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 text-white no-underline">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <DoorOpen className="h-5 w-5 text-cyan-200" />
          </span>
          <span className="text-lg font-semibold tracking-tight">OpenDoor</span>
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-black/10 transition hover:bg-white/15"
        >
          Skip to dashboard
        </Link>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-10 px-6 pb-16 pt-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:pb-24 lg:pt-16">
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
            <Sparkles className="h-4 w-4" />
            Your workspace is ready
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
            Launch your AI gateway in three steps.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Create a scoped API key, point your OpenAI-compatible client at
            OpenDoor, then turn on the controls your team needs for production.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Credits", value: `$${credits.toFixed(0)}` },
              { label: "Active keys", value: String(keyCount) },
              { label: "Setup", value: `${completedSteps}/3` },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur">
                <div className="text-3xl font-semibold tracking-tight">{item.value}</div>
                <div className="mt-1 text-sm text-slate-400">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-6">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Onboarding</p>
                <h2 className="mt-2 text-2xl font-semibold">Recommended path</h2>
              </div>
              <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-sm font-medium text-emerald-200">
                {completedSteps} complete
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <OnboardingStep
                done
                icon={ShieldCheck}
                title="Workspace created"
                description={`${org?.name || "Your organization"} is on the ${
                  org?.plan || "free"
                } plan. Top up $20 or more to get $5 of open-weight credit.`}
                href="/dashboard/settings"
                cta="Review settings"
              />
              <OnboardingStep
                done={keyCount > 0}
                icon={KeyRound}
                title="Create your first API key"
                description="Generate a key for local development or production, then restrict model access when you need tighter controls."
                href="/dashboard/api-keys"
                cta={keyCount > 0 ? "Manage keys" : "Create API key"}
                primary={keyCount === 0}
              />
              <OnboardingStep
                done={false}
                icon={Code2}
                title="Make a test request"
                description="Use the OpenAI-compatible endpoint to verify routing, usage tracking, and latency metrics."
                href="/dashboard/playground"
                cta="Open playground"
                primary={keyCount > 0}
              />
              <OnboardingStep
                done={(org?.plan || "free") !== "free"}
                icon={CreditCard}
                title="Add billing when you scale"
                description="Upgrade for larger budgets, top-ups, and team-ready spend controls."
                href="/dashboard/billing"
                cta="View billing"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-6 pb-12 lg:grid-cols-3 lg:px-8">
        {[
          {
            icon: UsersRound,
            title: "Invite your team",
            body: "Bring engineers and operators into one workspace with role-aware access.",
            href: "/dashboard/team",
          },
          {
            icon: ShieldCheck,
            title: "Define governance",
            body: "Set model policies, audit controls, approvals, and compliance posture.",
            href: "/dashboard/governance",
          },
          {
            icon: CreditCard,
            title: "Control spend",
            body: "Track usage, add credits, and keep rolling budgets visible from day one.",
            href: "/dashboard/usage",
          },
        ].map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-white no-underline transition hover:-translate-y-1 hover:bg-white/[0.1]"
          >
            <card.icon className="h-6 w-6 text-cyan-200" />
            <h3 className="mt-5 text-lg font-semibold">{card.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{card.body}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-cyan-200">
              Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </section>
    </main>
    </div>
  );
}

function OnboardingStep({
  done,
  icon: Icon,
  title,
  description,
  href,
  cta,
  primary = false,
}: {
  done: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
      <div className="flex gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-cyan-200">
          {done ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <Link
              href={href}
              className={
                primary
                  ? "rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 no-underline transition hover:bg-cyan-200"
                  : "rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-cyan-100 no-underline transition hover:bg-white/10"
              }
            >
              {cta}
            </Link>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
      </div>
    </div>
  );
}
