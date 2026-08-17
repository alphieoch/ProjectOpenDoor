import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileLock2 } from "lucide-react";
import { MarketingCtaBanner, MarketingHero } from "@/components/marketing-page-shell";
import { SecurityControls } from "@/components/security-controls";

export const metadata: Metadata = {
  title: "Security — OpenDoor",
  description:
    "SSO, audit logs, model governance, data residency, and spend controls in front of every LLM provider.",
};

const grid = [
  "WorkOS-ready SSO",
  "Role-based membership",
  "Scoped API keys",
  "Model allowlists",
  "Spend caps & RPM/TPM",
  "service_tier priority",
  "Model approvals",
  "Policy enforcement",
  "Violation review",
  "Sector packs",
  "Immutable audit logs",
  "UK/EU residency preference",
];

const badges = [
  { title: "SSO", body: "WorkOS" },
  { title: "Residency", body: "UK / EU routing" },
  { title: "Audit", body: "Immutable logs" },
  { title: "Spend", body: "Caps on every key" },
];

export default function SecurityPage() {
  return (
    <article id="security-page">
      <MarketingHero
        eyebrow="Security"
        title="Work confidently with production-grade controls."
        description="Governance, auditability, and access control sit in front of every provider — so teams move fast without bypassing risk controls."
        actions={
          <>
            <Link
              href="/get-started"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Start a workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/privacy"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Privacy policy
            </Link>
          </>
        }
      />

      <SecurityControls />

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-950">
          Features for teams that ship AI
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
          These are product controls in the gateway and dashboard — not borrowed certification logos.
        </p>
        <div className="mt-10 grid grid-cols-2 overflow-hidden rounded-[2rem] border border-slate-200 bg-white md:grid-cols-4">
          {grid.map((item) => (
            <div
              key={item}
              className="border-b border-r border-slate-100 px-5 py-5 text-sm font-medium text-slate-800 last:border-r-0 [&:nth-child(2n)]:border-r-0 md:[&:nth-child(2n)]:border-r md:[&:nth-child(4n)]:border-r-0"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
        <div className="overflow-hidden rounded-[2.5rem] bg-slate-950 p-8 text-white lg:p-12">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Security you can inspect</h2>
              <p className="mt-4 leading-8 text-slate-300">
                As a gateway, we sit on the request path. That is why controls are enforced in
                code — not promised as a future SOC badge.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Auth and policy before every provider hop",
                  "Choose UK or EU residency on the org",
                  "Trust Center for approvals, policies, and violations",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-slate-200">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {badges.map((b) => (
                <div
                  key={b.title}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                    {b.title}
                  </p>
                  <p className="mt-2 text-lg font-semibold">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-8 lg:px-8">
        <div className="flex flex-col gap-6 rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm md:flex-row md:items-center md:justify-between lg:p-10">
          <div className="flex gap-4">
            <FileLock2 className="h-10 w-10 shrink-0 text-blue-600" />
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Trust center in the product
              </h2>
              <p className="mt-2 max-w-xl text-slate-600">
                Policies, approvals, violations, and compliance views live under Dashboard → Trust
                Center once you are signed in.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/governance"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open trust center <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <MarketingCtaBanner
        title="Read how we handle data"
        description="Account, usage, and prompt handling are spelled out in the privacy policy."
        href="/privacy"
        label="Privacy policy"
      />
    </article>
  );
}
