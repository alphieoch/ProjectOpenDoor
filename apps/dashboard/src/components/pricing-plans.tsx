import Link from "next/link";
import { Check } from "lucide-react";
import { ACCOUNT_PLANS } from "@/lib/account-plans";
import { cn } from "@/lib/utils";

export function PricingPlans() {
  return (
    <section className="mt-12">
      <div className="grid gap-5 lg:grid-cols-3">
        {ACCOUNT_PLANS.map((plan) => {
          const featured = Boolean(plan.featured);
          return (
            <article
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-[1.75rem] border p-6 sm:p-7",
                featured
                  ? "border-slate-950 bg-slate-950 text-white shadow-xl shadow-slate-950/15"
                  : "border-slate-200 bg-white text-slate-950",
              )}
            >
              {plan.badge ? (
                <span
                  className={cn(
                    "absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
                    featured ? "bg-amber-300 text-slate-950" : "bg-slate-950 text-white",
                  )}
                >
                  {plan.badge}
                </span>
              ) : null}

              <p
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.2em]",
                  featured ? "text-slate-400" : "text-slate-400",
                )}
              >
                {plan.name}
              </p>
              {plan.subtitle ? (
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">{plan.subtitle}</h2>
              ) : (
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">{plan.name}</h2>
              )}
              <p className={cn("mt-2 text-sm leading-6", featured ? "text-slate-300" : "text-slate-600")}>
                {plan.tagline}
              </p>

              <div className="mt-6 flex items-end gap-1.5">
                <span className="text-5xl font-semibold tracking-tight">${plan.price}</span>
                <span className={cn("mb-1.5 text-sm", featured ? "text-slate-400" : "text-slate-500")}>
                  {plan.priceSuffix}
                </span>
              </div>
              <p className={cn("mt-2 text-sm font-medium", featured ? "text-amber-200" : "text-slate-800")}>
                {plan.included}
              </p>

              <Link
                href={plan.href}
                className={cn(
                  "mt-6 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition",
                  featured
                    ? "bg-white text-slate-950 hover:bg-slate-100"
                    : "bg-slate-950 text-white hover:bg-slate-800",
                )}
              >
                {plan.cta}
              </Link>

              <ul className="mt-7 space-y-3 text-sm leading-6">
                {plan.inherit ? (
                  <li className="flex gap-2.5 font-medium">
                    <span className={cn("mt-0.5", featured ? "text-amber-300" : "text-slate-950")}>+</span>
                    <span>{plan.inherit}</span>
                  </li>
                ) : null}
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        featured ? "text-amber-300" : "text-slate-950",
                      )}
                    />
                    <span className={featured ? "text-slate-200" : "text-slate-700"}>{feature}</span>
                  </li>
                ))}
                {plan.plus ? (
                  <li className="flex gap-2.5">
                    <span className={cn("mt-0.5 font-semibold", featured ? "text-amber-300" : "text-slate-950")}>
                      +
                    </span>
                    <span className={featured ? "text-slate-200" : "text-slate-700"}>{plan.plus}</span>
                  </li>
                ) : null}
              </ul>
            </article>
          );
        })}
      </div>
      <p className="mt-5 text-center text-sm text-slate-500">
        No free plan. Student $9.99, Pro $12 vs Perplexity Pro at $20. Included
        credit is a small taste so the seat still profits; tokens and GPUs stay
        prepaid after that. Top up $20+ and we add $5 of open-weight bonus.
      </p>
    </section>
  );
}
