import Link from "next/link";
import { ArrowRight, Briefcase, GraduationCap, Sparkles } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";

export default function GetStartedPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f9ff] text-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-24rem] h-[48rem] w-[48rem] -translate-x-1/2 rounded-full bg-blue-200/50 blur-3xl" />
        <div className="absolute right-[-14rem] top-40 h-[32rem] w-[32rem] rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute bottom-20 left-[-16rem] h-[34rem] w-[34rem] rounded-full bg-indigo-200/40 blur-3xl" />
      </div>

      <MarketingHeader />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">
            Get started
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-6xl">
            Choose your path.
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            OpenDoor adapts to how your team operates. Pick the setup that fits.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
          {/* Start free */}
          <div className="group flex flex-col rounded-[2rem] border border-slate-200/70 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-950/5">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white transition group-hover:bg-blue-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Start free
            </h2>
            <p className="mt-3 flex-1 leading-7 text-slate-600">
              Best for startups and teams who want to self-serve quickly. Starter credits included.
            </p>
            <Link
              href="/login?signup=1&segment=standard"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700"
            >
              Continue with email <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Education */}
          <div className="group flex flex-col rounded-[2rem] border border-slate-200/70 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-950/5">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white transition group-hover:bg-blue-700">
              <GraduationCap className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Education
            </h2>
            <p className="mt-3 flex-1 leading-7 text-slate-600">
              For universities, labs, and students. We'll tailor onboarding for learning workflows.
            </p>
            <Link
              href="/login?signup=1&segment=education"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              Continue with education signup
            </Link>
          </div>

          {/* Enterprise */}
          <div className="group flex flex-col rounded-[2rem] border border-slate-200/70 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-950/5">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-slate-700 text-white transition group-hover:bg-slate-800">
              <Briefcase className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Enterprise
            </h2>
            <p className="mt-3 flex-1 leading-7 text-slate-600">
              Existing enterprise users sign in via SSO. New deployments start with our team.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <Link
                href="/login?mode=sso"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
              >
                Join via SSO
              </Link>
              <a
                href="mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise%20Onboarding"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-slate-800"
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
