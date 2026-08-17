import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const MARKETING_PAGES = [
  { href: "/platform", label: "Platform" },
  { href: "/pricing", label: "Pricing" },
  { href: "/rankings", label: "Rankings" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/status", label: "Status" },
] as const;

export function MarketingHero({
  eyebrow,
  title,
  description,
  actions,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-12 pt-16 lg:px-8 lg:pb-16 lg:pt-20">
      {aside ? (
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">
              {eyebrow}
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">{description}</p>
            {actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
          </div>
          {aside}
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">{description}</p>
          {actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
        </>
      )}
    </section>
  );
}

export function MarketingCtaBanner({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-8">
      <div className="flex flex-col gap-6 rounded-[2rem] bg-slate-100/90 px-8 py-8 md:flex-row md:items-center md:justify-between lg:px-10">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
          <p className="mt-2 max-w-xl text-slate-600">{description}</p>
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {label} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
