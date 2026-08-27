export const dynamic = "force-dynamic";

import { unstable_rethrow } from "next/navigation";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { DashboardUnavailable } from "@/components/dashboard/dashboard-unavailable";
import { ENTERPRISE_SALES_HREF, parseSignupPlan } from "@/lib/signup-plan";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const enterpriseSales = parseSignupPlan(params.plan) === "enterprise";
  try {
    return (
      <>
        {enterpriseSales ? (
          <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
            Enterprise is billed through sales, not Stripe.{" "}
            <a href={ENTERPRISE_SALES_HREF} className="font-medium underline underline-offset-2">
              Talk to sales
            </a>
          </div>
        ) : null}
        {await DashboardHome()}
      </>
    );
  } catch (err) {
    unstable_rethrow(err);
    console.error("[dashboard] onboarding unavailable", err);
    return (
      <DashboardUnavailable
        title="Welcome to OpenDoor"
        body="Setup could not be loaded. Nothing on this page is invented — open Chat or OpenBot, or refresh Overview."
      />
    );
  }
}
