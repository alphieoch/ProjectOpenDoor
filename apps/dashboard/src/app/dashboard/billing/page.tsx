"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function BillingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/settings?tab=billing");
  }, [router]);

  return (
    <div className="flex h-64 flex-col items-center justify-center space-y-3">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
      <p className="text-xs text-zinc-400 font-mono">Redirecting to Settings & Billing Hub…</p>
    </div>
  );
}
