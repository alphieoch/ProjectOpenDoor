"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";

export default function ImpersonationBanner() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function stopImpersonating() {
    setLoading(true);
    await fetch("/api/admin/stop-impersonate", { method: "POST" });
    router.push("/admin/orgs");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between bg-amber-500 px-6 py-2.5 text-sm font-medium text-amber-950">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>You are impersonating an organization. Actions taken here affect real data.</span>
      </div>
      <button
        onClick={stopImpersonating}
        disabled={loading}
        className="rounded-md bg-amber-950/15 px-3 py-1 text-xs font-semibold text-amber-950 transition hover:bg-amber-950/25 disabled:opacity-50"
      >
        {loading ? "Stopping…" : "Stop impersonating"}
      </button>
    </div>
  );
}
