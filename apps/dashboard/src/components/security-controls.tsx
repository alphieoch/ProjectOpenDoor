"use client";

import { useState } from "react";
import { Fingerprint, Globe2, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "sso",
    label: "SSO",
    icon: Users,
    title: "Sign in once. Enforce roles after.",
    body: "Workspaces use WorkOS-ready SSO and role-based membership. API keys stay scoped to models, RPM/TPM, and spend caps — separate from the human login.",
    points: [
      "Organization workspaces with owner / admin / member roles",
      "SSO-ready org settings via WorkOS",
      "Scoped keys with model allowlists and spend caps",
    ],
  },
  {
    id: "governance",
    label: "Governance",
    icon: ShieldCheck,
    title: "Approve models before they hit production.",
    body: "Policies run in the gateway before a provider is called. Approvals, violations, and sector packs live in the Trust Center.",
    points: [
      "Model approval workflows",
      "Policy enforcement and violation review",
      "Sector packs for regulated industries",
    ],
  },
  {
    id: "residency",
    label: "Residency",
    icon: Globe2,
    title: "Keep routing inside the region you chose.",
    body: "Org-level residency (UK/EU and others) is a routing preference, not a marketing badge. Audit logs stay with the workspace that produced them.",
    points: [
      "Data residency preference on the org",
      "Provider routing honors the selected region",
      "Immutable audit log for sensitive dashboard actions",
    ],
  },
  {
    id: "runtime",
    label: "Runtime",
    icon: Fingerprint,
    title: "Every /v1 call is authenticated and metered.",
    body: "Auth, rate limits, spend-tier TPM unlocks, and service_tier (standard / priority) gate the request. Prompt-cache affinity does not invent cheaper tokens.",
    points: [
      "Auth + rate limits on every /v1 route",
      "service_tier priority vs standard load-shed",
      "Honest cached-input billing (50% until cache ships)",
    ],
  },
] as const;

export function SecurityControls() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("sso");
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];
  const Icon = tab.icon;

  return (
    <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition",
              active === item.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white">
              <Icon className="h-5 w-5" />
            </span>
            {tab.label}
          </div>
          <ul className="mt-6 space-y-3">
            {tab.points.map((point) => (
              <li
                key={point}
                className="rounded-2xl border border-slate-100 bg-[#F6F5F1] px-4 py-3 text-sm leading-6 text-slate-700"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{tab.title}</h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">{tab.body}</p>
        </div>
      </div>
    </section>
  );
}
