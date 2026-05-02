"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Server,
  Zap,
  RefreshCw,
  Loader2,
} from "lucide-react";

interface ProviderStatus {
  name: string;
  slug: string;
  status: "up" | "down" | "unknown";
  latencyMs: number | null;
}

interface StatusData {
  status: string;
  timestamp: string;
  gateway: {
    status: "up" | "down";
    latencyMs: number | null;
    url: string;
  };
  providers: ProviderStatus[];
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setLastUpdated(new Date());
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const allUp =
    data?.gateway.status === "up" &&
    data?.providers.every((p) => p.status === "up" || p.status === "unknown");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary-600 p-2">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                OpenDoor Status
              </h1>
              <p className="text-sm text-gray-500">
                Real-time system health and provider availability
              </p>
            </div>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>

        {/* Overall Status */}
        <div
          className={`mb-6 rounded-xl border p-6 ${
            allUp
              ? "border-green-200 bg-green-50"
              : data?.gateway.status === "down"
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="flex items-center gap-3">
            {allUp ? (
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            ) : data?.gateway.status === "down" ? (
              <XCircle className="h-8 w-8 text-red-600" />
            ) : (
              <HelpCircle className="h-8 w-8 text-amber-600" />
            )}
            <div>
              <h2
                className={`text-xl font-bold ${
                  allUp
                    ? "text-green-800"
                    : data?.gateway.status === "down"
                    ? "text-red-800"
                    : "text-amber-800"
                }`}
              >
                {allUp
                  ? "All Systems Operational"
                  : data?.gateway.status === "down"
                  ? "Gateway Unavailable"
                  : "Partial Outage"}
              </h2>
              <p className="text-sm text-gray-600">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>

        {/* Gateway Card */}
        {data && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                OpenDoor Gateway
              </h3>
              <span
                className={`ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
                  data.gateway.status === "up"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {data.gateway.status === "up" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {data.gateway.status === "up" ? "Operational" : "Down"}
              </span>
            </div>
            {data.gateway.latencyMs && (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                Response time: {data.gateway.latencyMs}ms
              </div>
            )}
          </div>
        )}

        {/* Providers Grid */}
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          LLM Provider Status
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data?.providers.map((provider) => (
            <div
              key={provider.slug}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-gray-400" />
                  <span className="font-medium text-gray-900">
                    {provider.name}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    provider.status === "up"
                      ? "bg-green-100 text-green-700"
                      : provider.status === "down"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {provider.status === "up" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : provider.status === "down" ? (
                    <XCircle className="h-3 w-3" />
                  ) : (
                    <HelpCircle className="h-3 w-3" />
                  )}
                  {provider.status === "up"
                    ? "Up"
                    : provider.status === "down"
                    ? "Down"
                    : "Unknown"}
                </span>
              </div>
              {provider.latencyMs && (
                <div className="mt-2 text-xs text-gray-500">
                  Latency: {provider.latencyMs}ms
                </div>
              )}
            </div>
          ))}
          {!data &&
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-gray-200"
              />
            ))}
        </div>

        <div className="mt-8 text-center text-xs text-gray-400">
          <p>
            Status checks run every 30 seconds. Provider health is checked via
            public API endpoints.
          </p>
          <p className="mt-1">
            For incident reports, contact{" "}
            <a
              href="mailto:support@opendoor.ai"
              className="text-primary-600 hover:underline"
            >
              support@opendoor.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
