export const dynamic = "force-dynamic";

import { unstable_rethrow } from "next/navigation";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

export default async function DashboardPage() {
  try {
    return await DashboardHome();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[dashboard] overview unavailable", err);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace stats could not be loaded. Open Chat or OpenBot to keep working.
          </p>
        </div>
      </div>
    );
  }
}
