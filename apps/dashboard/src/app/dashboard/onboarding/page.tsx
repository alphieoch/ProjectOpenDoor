"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { CheckCircle2, Circle, ArrowRight, School, Building2 } from "lucide-react";

type Segment = "standard" | "education" | "enterprise_intent";
type Checklist = {
  apiKeyCreated?: boolean;
  firstChatCompleted?: boolean;
  enterpriseReviewed?: boolean;
  completedAt?: string;
};

type State = {
  segment: Segment;
  checklist: Checklist;
  completed: boolean;
};

const defaultState: State = {
  segment: "standard",
  checklist: {},
  completed: false,
};

export default function OnboardingPage() {
  const [state, setState] = useState<State>(defaultState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/onboarding", { cache: "no-store" });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = (await res.json()) as State;
      if (!cancelled) {
        setState(data);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      posthog.capture("onboarding_viewed", {
        onboarding_segment: state.segment,
        onboarding_completed: state.completed,
      });
    }
  }, [loading, state.segment, state.completed]);

  const steps = useMemo(() => {
    if (state.segment === "enterprise_intent") {
      return [
        {
          id: "enterpriseReviewed",
          done: Boolean(state.checklist.enterpriseReviewed),
          title: "Join your enterprise workspace via SSO",
          description:
            "Enterprise workspaces are provisioned by your admin team. Use your organization slug and continue with SSO.",
          primaryLabel: "Go to SSO sign-in",
          primaryHref: "/login?mode=sso",
          secondaryLabel: "Talk to sales",
          secondaryHref:
            "mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise%20Onboarding",
        },
      ];
    }

    return [
      {
        id: "apiKeyCreated",
        done: Boolean(state.checklist.apiKeyCreated),
        title: "Create your first API key",
        description: "Generate a key and keep it somewhere secure.",
        primaryLabel: "Open API Keys",
        primaryHref: "/dashboard/api-keys",
      },
      {
        id: "firstChatCompleted",
        done: Boolean(state.checklist.firstChatCompleted),
        title: "Send your first gateway request",
        description: "Use the playground to validate your first model call.",
        primaryLabel: "Open Playground",
        primaryHref: "/dashboard/playground",
      },
    ];
  }, [state.segment, state.checklist]);

  async function markEnterpriseReviewed() {
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "enterprise_reviewed" }),
    });
    setState((prev) => ({
      ...prev,
      checklist: { ...prev.checklist, enterpriseReviewed: true, completedAt: new Date().toISOString() },
      completed: true,
    }));
    posthog.capture("onboarding_step_completed", {
      onboarding_segment: "enterprise_intent",
      onboarding_step: "enterprise_reviewed",
    });
  }

  if (loading) {
    return <div className="page-desc">Loading onboarding…</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Welcome to OpenDoor</h1>
        <p className="page-desc">
          {state.segment === "education"
            ? "Education onboarding helps you get to a first successful request quickly."
            : state.segment === "enterprise_intent"
              ? "Enterprise onboarding routes you to the right SSO and sales paths."
              : "Complete these steps to finish your setup."}
        </p>
      </div>

      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          {state.segment === "education" ? (
            <School className="h-4 w-4" />
          ) : state.segment === "enterprise_intent" ? (
            <Building2 className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          Segment:{" "}
          <strong>
            {state.segment === "enterprise_intent"
              ? "Enterprise"
              : state.segment === "education"
                ? "Education"
                : "Standard"}
          </strong>
        </div>

        {steps.map((step) => (
          <div key={step.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <div className="mb-2 flex items-start gap-2">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 text-zinc-400" />
              )}
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{step.title}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{step.description}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              {"primaryHref" in step ? (
                <Link href={step.primaryHref} className="btn-primary">
                  {step.primaryLabel}
                </Link>
              ) : null}
              {"secondaryHref" in step ? (
                <a className="btn" href={step.secondaryHref}>
                  {step.secondaryLabel}
                </a>
              ) : null}
              {state.segment === "enterprise_intent" && !step.done ? (
                <button className="btn" onClick={markEnterpriseReviewed} type="button">
                  Mark complete
                </button>
              ) : null}
            </div>
          </div>
        ))}

        {state.completed ? (
          <div className="alert-success">
            Onboarding complete. Continue to your{" "}
            <Link className="underline" href="/dashboard">
              dashboard
            </Link>
            .
          </div>
        ) : null}
      </div>
    </div>
  );
}
