"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { DashboardErrorFallback } from "@/components/dashboard/dashboard-error-boundary";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      posthog.captureException(error);
    } catch {
      // PostHog may be uninitialized if env keys are missing
    }
  }, [error]);

  return <DashboardErrorFallback error={error} reset={reset} />;
}
