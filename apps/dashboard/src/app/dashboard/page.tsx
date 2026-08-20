export const dynamic = "force-dynamic";

import { unstable_rethrow } from "next/navigation";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { DashboardUnavailable } from "@/components/dashboard/dashboard-unavailable";

export default async function DashboardPage() {
  try {
    return await DashboardHome();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[dashboard] overview unavailable", err);
    return (
      <DashboardUnavailable
        title="Welcome back."
        body="Workspace stats could not be loaded. Nothing on this page is invented — open Chat or OpenBot, or refresh Overview."
      />
    );
  }
}
