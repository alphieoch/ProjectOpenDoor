"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SnapCarousel, snapCarouselItemClassName } from "@/components/dashboard/snap-carousel";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import {
  GETTING_STARTED_CATALOG,
  GETTING_STARTED_STEPS,
  developerStepHref,
  type GettingStartedProgress,
  type GettingStartedStepId,
  type OnboardingEvidence,
} from "@/lib/onboarding";

export function GettingStartedCard({
  progress,
  evidence,
}: {
  progress: GettingStartedProgress;
  evidence: OnboardingEvidence;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    posthog.capture("onboarding_viewed", {
      onboarding_plan: progress.planLabel,
      onboarding_completed: progress.completed,
      onboarding_required_done: progress.requiredDone,
    });
  }, [progress.completed, progress.planLabel, progress.requiredDone]);

  if (dismissed) return null;

  async function dismiss() {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "dismissed" }),
    });
    if (!res.ok) return;
    setDismissed(true);
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-6">
      <PageHeader
        compact
        className="mb-4"
        eyebrow="Getting started"
        title="Welcome to OpenDoor"
        description={
          progress.requiredDone
            ? "Core setup is done. Optional steps below are there when you need them."
            : "Chat and a coworker get you into the product. Everything else is optional."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{progress.planLabel}</Badge>
            <span className="text-xs text-muted-foreground">
              {progress.doneCount}/{progress.totalCount} complete
            </span>
          </div>
        }
      />

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.round((progress.doneCount / progress.totalCount) * 100)}%` }}
        />
      </div>

      <GettingStartedCarousel progress={progress} evidence={evidence} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          disabled={pending}
          onClick={() => void dismiss()}
        >
          Hide setup
        </button>
        <p className="text-xs text-muted-foreground">
          Overview below stays live either way.
        </p>
      </div>
    </section>
  );
}

function GettingStartedCarousel({
  progress,
  evidence,
}: {
  progress: GettingStartedProgress;
  evidence: OnboardingEvidence;
}) {
  return (
    <SnapCarousel
      ariaLabel="Getting started steps"
      prevLabel="Previous setup steps"
      nextLabel="Next setup steps"
    >
      {GETTING_STARTED_STEPS.map((id) => (
        <GettingStartedSlide
          key={id}
          id={id}
          done={progress.steps[id]}
          evidence={evidence}
        />
      ))}
    </SnapCarousel>
  );
}

function GettingStartedSlide({
  id,
  done,
  evidence,
}: {
  id: GettingStartedStepId;
  done: boolean;
  evidence: OnboardingEvidence;
}) {
  const meta = GETTING_STARTED_CATALOG[id];
  const href = id === "developer" ? developerStepHref(evidence) : meta.href;
  const label = done
    ? meta.doneCta
    : id === "developer" && (evidence.userApiKeyCount > 0 || evidence.apiKeyCreated)
      ? "Open Playground"
      : meta.cta;

  return (
    <article
      data-carousel-card
      className={cn(
        snapCarouselItemClassName,
        "flex flex-col rounded-xl border border-border bg-background p-4"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center">
          {done ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="sr-only">{done ? "Completed" : "Not started"}</span>
        </span>
        {meta.optional ? (
          <Badge variant="outline" className="font-normal">
            Optional
          </Badge>
        ) : (
          <span className="sr-only">Required</span>
        )}
      </div>
      <p className="mt-3 font-medium text-foreground">{meta.title}</p>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{meta.description}</p>
      <Link
        href={href}
        className={cn(
          buttonVariants({ variant: done ? "outline" : "default", size: "sm" }),
          "mt-4 w-full"
        )}
      >
        {label}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

export function NextActionCard({
  progress,
  evidence,
}: {
  progress: GettingStartedProgress;
  evidence: OnboardingEvidence;
}) {
  const nextId = progress.nextStepId;
  const next = nextId ? GETTING_STARTED_CATALOG[nextId] : null;
  const href = nextId === "developer" ? developerStepHref(evidence) : next?.href;

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Next
        </p>
        {next && href ? (
          <>
            <h2 className="mt-2 font-sans text-lg font-semibold text-foreground">{next.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{next.description}</p>
            <Link href={href} className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
              {next.cta}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        ) : (
          <>
            <h2 className="mt-2 font-sans text-lg font-semibold text-foreground">You are set up</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Jump into Chat, OpenBot, or Usage whenever you need them.
            </p>
            <Link href="/dashboard/chat" className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
              Open Chat
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
