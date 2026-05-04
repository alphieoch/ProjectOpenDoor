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
  Cloud,
} from "lucide-react";

interface ProviderStatus {
  name: string;
  slug: string;
  status: "up" | "down" | "unknown" | "not_configured";
  latencyMs: number | null;
}

interface SubsystemStatus {
  status: "up" | "down" | "unknown";
  latencyMs: number | null;
}

interface AzureStatusPayload {
  configured: boolean;
  host: string | null;
  deploymentCount: number;
  deployments: { id: string; model: string; status: string }[];
  fetchError: string | null;
}

interface StatusData {
  status: string;
  timestamp: string;
  gateway: {
    status: "up" | "down";
    latencyMs: number | null;
    url: string;
  };
  database?: SubsystemStatus;
  redis?: SubsystemStatus;
  providers: ProviderStatus[];
  azure?: AzureStatusPayload;
  source?: string;
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

  const infraUp =
    data &&
    data.gateway.status === "up" &&
    data.database?.status !== "down" &&
    data.redis?.status !== "down";
  const anyProviderDown = data?.providers.some((p) => p.status === "down");
  const allUp = Boolean(
    infraUp &&
      !anyProviderDown &&
      data?.providers.every((p) => p.status === "up" || p.status === "not_configured" || p.status === "unknown")
  );

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
                Live gateway checks: Postgres, Redis, provider adapters, and Azure OpenAI deployments when
                configured.
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
                  : data?.database?.status === "down" || data?.redis?.status === "down"
                  ? "Infrastructure Degraded"
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
            {data.gateway.latencyMs != null && (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                Status round-trip: {data.gateway.latencyMs}ms
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500 break-all">{data.gateway.url}</p>
          </div>
        )}

        {/* Database & Redis */}
        {data && (data.database || data.redis) && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.database && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">PostgreSQL</h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      data.database.status === "up"
                        ? "bg-green-100 text-green-700"
                        : data.database.status === "down"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {data.database.status === "up"
                      ? "Connected"
                      : data.database.status === "down"
                      ? "Down"
                      : "Unknown"}
                  </span>
                </div>
                {data.database.latencyMs != null && (
                  <p className="mt-2 text-xs text-gray-500">Query latency: {data.database.latencyMs}ms</p>
                )}
              </div>
            )}
            {data.redis && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Redis</h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      data.redis.status === "up"
                        ? "bg-green-100 text-green-700"
                        : data.redis.status === "down"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {data.redis.status === "up"
                      ? "Connected"
                      : data.redis.status === "down"
                      ? "Down"
                      : "Unknown"}
                  </span>
                </div>
                {data.redis.latencyMs != null && (
                  <p className="mt-2 text-xs text-gray-500">PING latency: {data.redis.latencyMs}ms</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Providers Grid */}
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Provider adapters (env registration in gateway)
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
                      : provider.status === "not_configured"
                      ? "bg-slate-100 text-slate-600"
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
                    ? "Ready"
                    : provider.status === "down"
                    ? "Down"
                    : provider.status === "not_configured"
                    ? "Not configured"
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

        {data?.azure?.configured && (
          <div className="mt-10">
            <div className="mb-4 flex items-center gap-2">
              <Cloud className="h-5 w-5 text-sky-600" />
              <h3 className="text-lg font-semibold text-gray-900">Azure AI — live deployments</h3>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              Listed from Azure OpenAI{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">GET /openai/deployments</code>
              {data.azure.host ? (
                <>
                  {" "}
                  for <span className="font-medium text-gray-800">{data.azure.host}</span>
                </>
              ) : null}
              . These deployment ids are what your gateway uses for <code className="rounded bg-gray-100 px-1 text-xs">model</code>{" "}
              when routing through Azure.
            </p>
            {data.azure.fetchError ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Could not list deployments: {data.azure.fetchError}
              </div>
            ) : null}
            {!data.azure.fetchError && data.azure.deployments.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                No deployments returned. Confirm the API key can read deployments and that your resource exposes the
                OpenAI control plane API.
              </p>
            ) : null}
            {data.azure.deployments.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="max-h-[min(420px,50vh)] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="px-4 py-3">Deployment id</th>
                        <th className="px-4 py-3">Model</th>
                        <th className="px-4 py-3">Azure status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.azure.deployments.map((d) => (
                        <tr key={d.id} className="text-gray-900">
                          <td className="px-4 py-2 font-mono text-xs">{d.id}</td>
                          <td className="px-4 py-2">{d.model}</td>
                          <td className="px-4 py-2 text-gray-600">{d.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
                  Showing {data.azure.deployments.length}
                  {data.azure.deploymentCount > data.azure.deployments.length
                    ? ` of ${data.azure.deploymentCount} total (list truncated at 200)`
                    : ""}{" "}
                  deployment{data.azure.deployments.length !== 1 ? "s" : ""}.
                </p>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-gray-400">
          <p>
            Refreshes every 30 seconds. Data comes from your gateway&apos;s{" "}
            <code className="rounded bg-gray-100 px-1">/status</code> (Postgres, Redis, providers, Azure deployments).
          </p>
          {data?.source && (
            <p className="mt-1 font-mono text-[10px] text-gray-400">Source: {data.source}</p>
          )}
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
