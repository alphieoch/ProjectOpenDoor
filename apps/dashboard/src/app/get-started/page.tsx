import Link from "next/link";
import { ArrowRight, Briefcase, GraduationCap, Sparkles } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";

export default function GetStartedPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Get started
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em] text-foreground sm:text-6xl">
            Choose your path.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            OpenDoor adapts to how your team operates. Pick the setup that fits.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
          {/* Start free */}
          <div className="group flex flex-col rounded-lg border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Start free
            </h2>
            <p className="mt-3 flex-1 leading-7 text-muted-foreground">
              Best for startups and teams who want to self-serve quickly. Starter credits included.
            </p>
            <Link
              href="/login?signup=1&segment=standard"
              className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Continue with email <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Education */}
          <div className="group flex flex-col rounded-lg border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Education
            </h2>
            <p className="mt-3 flex-1 leading-7 text-muted-foreground">
              For universities, labs, and students. We'll tailor onboarding for learning workflows.
            </p>
            <Link
              href="/login?signup=1&segment=education"
              className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              Continue with education signup
            </Link>
          </div>

          {/* Enterprise */}
          <div className="group flex flex-col rounded-lg border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Briefcase className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Enterprise
            </h2>
            <p className="mt-3 flex-1 leading-7 text-muted-foreground">
              Existing enterprise users sign in via SSO. New deployments start with our team.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <Link
                href="/login?mode=sso"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
              >
                Join via SSO
              </Link>
              <a
                href="mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise%20Onboarding"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Talk to sales
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
