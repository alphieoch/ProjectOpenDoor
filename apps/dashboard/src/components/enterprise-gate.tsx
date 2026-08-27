"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

export function EnterpriseGate({
  locked,
  feature,
  children,
}: {
  locked: boolean;
  feature: string;
  children: React.ReactNode;
}) {
  if (!locked) return <>{children}</>;

  return (
    <div className="relative isolate min-h-full flex-1">
      <div className="pointer-events-none select-none blur-[7px] opacity-50" aria-hidden>
        {children}
      </div>
      <div className="pointer-events-none absolute inset-0 z-10">
        <div
          className="sticky top-0 flex items-center justify-center bg-[color-mix(in_srgb,hsl(var(--background))_35%,transparent)] px-6"
          style={{ minHeight: "calc(100dvh - 10rem)" }}
        >
          <div
            className="pointer-events-auto w-full max-w-md rounded-2xl border px-8 py-8 text-center shadow-xl"
            style={{
              background: "hsl(var(--background))",
              borderColor: "hsl(var(--border))",
            }}
          >
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "hsl(var(--primary) / 0.14)" }}
            >
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary"
            >
              Enterprise only
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
              {feature} is for Enterprise users only
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
              Upgrade your plan to gain access to this.
            </p>
            <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
              <Link href="/dashboard/settings?tab=billing" className="btn-primary">
                Upgrade your plan
              </Link>
              <a
                href="mailto:sales@opendoor.ai?subject=OpenDoor%20Enterprise"
                className="btn"
              >
                Talk to sales
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
