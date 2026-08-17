"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, CircleHelp, RefreshCw } from "lucide-react";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { cn } from "@/lib/utils";

type ProviderRow = {
  name: string;
  slug: string;
  status: "up" | "down" | "unknown" | "not_configured";
  latencyMs: number | null;
};

type StatusPayload = {
  status: string;
  timestamp: string;
  gateway: { status: string; latencyMs: number | null; url: string };
  database: { status: string; latencyMs: number | null };
  redis: { status: string; latencyMs: number | null };
  providers: ProviderRow[];
  source?: string;
};

function isUp(status: string) {
  return status === "up" || status === "operational";
}

function banner(status: string) {
  if (isUp(status)) {
    return {
      className: "bg-emerald-500 text-white",
      label: "All systems operational",
      Icon: CheckCircle2,
    };
  }
  if (status === "degraded") {
    return {
      className: "bg-amber-500 text-white",
      label: "Degraded performance",
      Icon: CircleAlert,
    };
  }
  return {
    className: "bg-slate-800 text-white",
    label: status ? status.replace(/_/g, " ") : "Status unknown",
    Icon: CircleHelp,
  };
}

function StatusIcon({ status }: { status: string }) {
  if (isUp(status)) return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (status === "not_configured" || status === "unknown") {
    return <CircleHelp className="h-5 w-5 text-slate-400" />;
  }
  return <CircleAlert className="h-5 w-5 text-amber-600" />;
}

function statusLabel(status: string) {
  if (isUp(status)) return "Operational";
  return status.replace(/_/g, " ");
}

export function StatusBoard({ externalStatusUrl }: { externalStatusUrl?: string | null }) {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError("");
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Status ${r.status}`))))
      .then((json) => setData(json))
      .catch((err: Error) => setError(err.message || "Could not load status"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const tone = data ? banner(data.status) : null;
  const components = data
    ? [
        { name: "Gateway API", status: data.gateway.status, latencyMs: data.gateway.latencyMs },
        { name: "Database", status: data.database.status, latencyMs: data.database.latencyMs },
        { name: "Redis", status: data.redis.status, latencyMs: data.redis.latencyMs },
      ]
    : [];

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">Status</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">System status</h1>
          <p className="mt-3 max-w-xl text-lg leading-8 text-slate-600">
            Live checks against{" "}
            <span className="font-mono text-sm text-slate-800">{gatewayBaseUrl()}</span>
            {data?.source ? (
              <span className="text-slate-400"> · {data.source.replace(/_/g, " ")}</span>
            ) : null}
            .
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {externalStatusUrl && (
        <a
          href={externalStatusUrl}
          className="mt-3 inline-block text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Historical status page
        </a>
      )}

      {error && (
        <p className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </p>
      )}

      {tone && (
        <div
          className={cn(
            "mt-10 flex items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-semibold",
            tone.className
          )}
        >
          <tone.Icon className="h-6 w-6" />
          {tone.label}
        </div>
      )}

      {!data && !error && <p className="mt-10 text-sm text-slate-500">Checking gateway…</p>}

      {data && (
        <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
          <ul>
            {components.map((row) => (
              <li
                key={row.name}
                className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <StatusIcon status={row.status} />
                  <div>
                    <p className="font-medium text-slate-950">{row.name}</p>
                    <p className="text-xs text-slate-500">
                      {typeof row.latencyMs === "number" ? `${row.latencyMs}ms` : "No latency yet"}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold capitalize",
                    isUp(row.status) ? "text-emerald-600" : "text-slate-500"
                  )}
                >
                  {statusLabel(row.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && (
        <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-950">
            Providers
          </div>
          {data.providers.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              No provider rows returned from the gateway.
            </p>
          ) : (
            <ul>
              {data.providers.map((p) => (
                <li
                  key={p.slug}
                  className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-3.5 first:border-t-0"
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon status={p.status} />
                    <div>
                      <p className="text-sm font-medium text-slate-950">{p.name}</p>
                      <p className="font-mono text-xs text-slate-400">{p.slug}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold capitalize",
                      isUp(p.status) ? "text-emerald-600" : "text-slate-500"
                    )}
                  >
                    {statusLabel(p.status)}
                    {typeof p.latencyMs === "number" ? (
                      <span className="ml-2 font-mono text-xs font-normal text-slate-400">
                        {p.latencyMs}ms
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {data && (
        <p className="mt-6 text-sm text-slate-500">
          Last checked {new Date(data.timestamp).toLocaleString()}. These are live probes — we do
          not invent a 90-day uptime bar.
        </p>
      )}
    </section>
  );
}
