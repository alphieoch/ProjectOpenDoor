"use client";

import Link from "next/link";

export default function OnboardingError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#06111f] px-6 text-center text-white">
      <h1 className="text-xl font-semibold">Onboarding failed to load</h1>
      <p className="max-w-md text-sm text-slate-300">
        Your workspace is still there. Try again, or skip straight to the dashboard.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white"
        >
          Skip to dashboard
        </Link>
      </div>
    </div>
  );
}
