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
      if (res.ok) {
        const data = await res.json();
        setLimits(data);
      }
      setLoading(false);
    }
    fetchLimits();
    const id = setInterval(fetchLimits, 10000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">Loading rate limits...</p>
      </div>
    );
  }

  if (!limits) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">Unable to load rate limits.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Rate Limits</h2>
      <p className="mt-1 text-sm text-gray-600">
        Current usage against your API key limits
      </p>

      <div className="mt-4 space-y-4">
        <RateBar
          label="Requests / minute"
          used={limits.rpm.used}
          limit={limits.rpm.limit}
        />
        <RateBar
          label="Tokens / minute"
          used={limits.tpm.used}
          limit={limits.tpm.limit}
        />
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Resets at {new Date(limits.resetAt).toLocaleTimeString()}
      </p>
    </div>
  );
}

function RateBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = Math.min(100, Math.round((used / limit) * 100));

  const barColor = cn(
    "h-2 rounded-full transition-all",
    pct < 50 && "bg-green-500",
    pct >= 50 && pct < 80 && "bg-yellow-500",
    pct >= 80 && "bg-red-500"
  );

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
        <div className={barColor} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-gray-500">{pct}% used</p>
    </div>
  );
}
