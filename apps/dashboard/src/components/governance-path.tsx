import Link from "next/link";
import { Card } from "@/components/ui/card";

const STEPS = [
  { n: "01", title: "Request", body: "App or playground sends a completion with a data class.", href: "/dashboard/playground" },
  { n: "02", title: "Guardrails", body: "The gateway scans for injection, PII, and secrets before any provider.", href: "/dashboard/governance/violations" },
  { n: "03", title: "Policy", body: "Org rules and the model registry allow, deny, or hold for approval.", href: "/dashboard/governance/policies" },
  { n: "04", title: "Record", body: "Blocks and reviews land here for audit — not in a separate GRC tool.", href: "/dashboard/governance/violations" },
];

export function GovernancePath() {
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Live intercept</div>
          <p className="mt-1 text-sm font-medium text-foreground">
            Policy runs on the gateway, on the request, before a model is called.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Not an after-the-fact log review.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((step) => (
          <Link
            key={step.n}
            href={step.href}
            className="rounded-xl bg-accent px-3 py-2.5 transition-colors hover:bg-accent/80"
          >
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{step.n}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{step.title}</div>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{step.body}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}
