"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface RateLimits {
  rpm: { limit: number; used: number; remaining: number };
  tpm: { limit: number; used: number; remaining: number };
  resetAt: string;
}

export default function RateLimitPanel() {
  const [limits, setLimits] = useState<RateLimits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLimits() {
      const res = await fetch("/api/rate-limits");
      if (res.ok) setLimits(await res.json());
      setLoading(false);
    }
    fetchLimits();
    const id = setInterval(fetchLimits, 10000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="card p-6">
        <p className="text-sm text-zinc-400">Loading rate limits…</p>
      </div>
    );
  }

  if (!limits) {
    return (
      <div className="card p-6">
        <p className="text-sm text-zinc-400">Unable to load rate limits.</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="section-title">Rate Limits</h2>
      <p className="mt-1 text-sm text-zinc-500">Current usage against your API key limits</p>

      <div className="mt-5 space-y-4">
        <RateBar label="Requests / minute" used={limits.rpm.used} limit={limits.rpm.limit} />
        <RateBar label="Tokens / minute" used={limits.tpm.used} limit={limits.tpm.limit} />
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        Resets at {new Date(limits.resetAt).toLocaleTimeString()}
      </p>
    </div>
  );
}

function RateBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));

  const barColor = cn(
    "h-1.5 rounded-full transition-all",
    pct < 50 && "bg-emerald-500",
    pct >= 50 && pct < 80 && "bg-amber-500",
    pct >= 80 && "bg-red-500"
  );

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-700">{label}</span>
        <span className="text-xs text-zinc-400">{used.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100">
        <div className={barColor} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-zinc-400">{pct}%</p>
    </div>
  );
}
