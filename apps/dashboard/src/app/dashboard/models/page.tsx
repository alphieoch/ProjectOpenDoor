"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Cloud, Copy, Cpu, LayoutGrid, List, Loader2, Play, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ModelMark } from "@/components/ui/model-mark";
import { ImportWeightsDialog } from "@/components/import-weights-dialog";
import { DeviceSupportPanel } from "@/components/device-support-panel";
import { DeviceInventoryConsent } from "@/components/device-inventory-consent";

type ModelLocation = "here" | "cloud";

type ModelRow = {
  id: string;
  label: string;
  provider: string;
  family?: string;
  status?: string;
  origin?: string;
  source?: string;
  location?: ModelLocation;
  isNew?: boolean;
  mine?: boolean;
  pricePer1MInputUsd?: number | null;
  pricePer1MOutputUsd?: number | null;
};

type DedicatedMetals = {
  present: boolean;
  available: boolean;
  reason: string;
  label: string;
  usableMemoryGb: number | null;
  usedMemoryGb: number;
  remainingMemoryGb: number | null;
  usedPercent: number | null;
  slotsUsed: number;
  slotsMax: number;
  slotsRemaining: number;
  runningLocal: number;
};

type GpuStatus = {
  local: {
    appleSilicon: boolean;
    ollamaInstalled: boolean;
    ollamaRunning: boolean;
    models: string[];
    hardware?: { chip?: string | null; memoryGb?: number | null; usableMemoryGb?: number | null };
  };
  dedicated?: DedicatedMetals;
};

function modelLocation(m: ModelRow): ModelLocation {
  if (m.location === "here" || m.location === "cloud") return m.location;
  const provider = (m.provider || "").toLowerCase();
  const label = (m.label || "").toLowerCase();
  if (provider.includes("local") || label.includes("this mac")) return "here";
  if (m.mine && m.source === "ollama") return "here";
  return "cloud";
}

function locationLabel(loc: ModelLocation) {
  return loc === "here" ? "Your metals" : "Ochieng & Co cloud";
}

function statusLabel(status?: string) {
  switch (status) {
    case "live":
      return "Healthy";
    case "warming":
      return "Warming";
    case "dedicated":
      return "Needs GPU";
    case "available_on_request":
      return "On request";
    default:
      return status || "—";
  }
}

function formatPer1M(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function modelBlurb(m: ModelRow) {
  if (modelLocation(m) === "here") {
    return `On your dedicated metals. Weights stay on this machine.`;
  }
  if (m.family === "open_weight") {
    return `Open-weight ${m.provider} model, native on Ochieng & Co cloud services.`;
  }
  return `${m.provider} model, native on Ochieng & Co cloud services.`;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [plan, setPlan] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "live" | "new">("open");
  const [where, setWhere] = useState<"all" | ModelLocation>("all");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModelRow | null>(null);
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null);
  const [deviceConsent, setDeviceConsent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [mRes, bRes] = await Promise.all([
          fetch("/api/models/available", { credentials: "include" }),
          fetch("/api/billing/info", { credentials: "include" }),
        ]);
        if (!mRes.ok) {
          const t = await mRes.text();
          throw new Error(t || "Failed to load models");
        }
        const mJson = (await mRes.json()) as { models?: ModelRow[] };
        const rows = Array.isArray(mJson.models) ? mJson.models : [];

        let p: string | null = null;
        let sub: string | null = null;
        if (bRes.ok) {
          const bJson = (await bRes.json()) as {
            org?: { plan?: string; subscriptionStatus?: string | null };
          };
          p = bJson.org?.plan ?? null;
          sub = bJson.org?.subscriptionStatus ?? null;
        }

        if (!cancelled) {
          setModels(rows);
          setPlan(p);
          setSubscriptionStatus(sub);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deviceConsent) {
      setGpuStatus(null);
      return;
    }
    let cancelled = false;
    fetch("/api/gpu/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setGpuStatus(data as GpuStatus);
      })
      .catch(() => {
        if (!cancelled) setGpuStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceConsent]);

  useEffect(() => {
    if (where === "here" && (!deviceConsent || (gpuStatus?.dedicated && !gpuStatus.dedicated.available))) {
      setWhere("all");
    }
  }, [where, gpuStatus, deviceConsent]);

  const filtered = useMemo(() => {
    let rows = models;
    if (filter === "open") rows = rows.filter((m) => m.family === "open_weight");
    if (filter === "live") rows = rows.filter((m) => m.status === "live");
    if (filter === "new") rows = rows.filter((m) => m.isNew);
    if (where !== "all") rows = rows.filter((m) => modelLocation(m) === where);
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        (m.origin || "").toLowerCase().includes(q)
    );
  }, [models, query, filter, where]);

  const newCount = useMemo(() => models.filter((m) => m.isNew).length, [models]);
  const liveOpenCount = useMemo(
    () => models.filter((m) => m.family === "open_weight" && m.status === "live").length,
    [models]
  );
  const hereCount = useMemo(() => models.filter((m) => modelLocation(m) === "here").length, [models]);
  const cloudCount = useMemo(() => models.filter((m) => modelLocation(m) === "cloud").length, [models]);
  const metals = gpuStatus?.dedicated ?? null;
  const metalsKnown = metals != null;
  const metalsValid = Boolean(metals?.available);

  const whereHint =
    where === "here"
      ? "Showing models on your dedicated metals. Import a Hugging Face repo to run here while capacity remains."
      : where === "cloud"
        ? "Showing models native on Ochieng & Co cloud services."
        : "Run native on Ochieng & Co cloud services. Dedicated metals stay off until you allow a device read.";

  function copyId(id: string) {
    void navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Models"
        description="Add and manage the models your org can call. Native on Ochieng & Co cloud services. Dedicated metals only after you allow a device read."
        actions={
          <>
            <ImportWeightsDialog
              defaultTarget={where === "here" && deviceConsent && metalsValid ? "local" : where === "cloud" ? "gcp" : undefined}
              metalsAvailable={deviceConsent && (!metalsKnown || metalsValid)}
              metalsReason={
                !deviceConsent
                  ? "Allow a device read first. Dedicated metals stay off until you do."
                  : metalsKnown
                    ? metals?.reason
                    : "Checking dedicated metals…"
              }
              onImported={() => {
                void fetch("/api/models/available", { credentials: "include" })
                  .then((r) => (r.ok ? r.json() : { models: [] }))
                  .then((data) => setModels(Array.isArray(data.models) ? data.models : []));
              }}
            />
            <Link href="/dashboard/playground" className="btn-primary">
              <Play className="h-4 w-4" />
              Try in playground
            </Link>
          </>
        }
      />

      <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm animate-in fade-in mb-6" style={{ padding: "18px 22px" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "hsl(var(--foreground))" }}>
              Configure models for your org
            </div>
            <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Plan <strong style={{ color: "hsl(var(--foreground))" }}>{plan ?? "—"}</strong>
              {subscriptionStatus ? ` · ${subscriptionStatus}` : ""}. {liveOpenCount} live open-weight models.
            </p>
          </div>
          <Link href="/dashboard/api-keys" className="md-btn-tonal">
            Configure API keys
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-lg"
            data-active={where === "cloud"}
            onClick={() => setWhere(where === "cloud" ? "all" : "cloud")}
            style={{ padding: 16 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Cloud className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
              <span style={{ fontWeight: 600, color: "hsl(var(--foreground))" }}>Ochieng & Co cloud services</span>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Native</span>
            </div>
            <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "hsl(var(--muted-foreground))", textAlign: "left" }}>
              Native path. {cloudCount} models through Ochieng & Co cloud services. Always a valid option.
            </p>
          </button>
          <div
            className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-lg"
            data-active={where === "here"}
            style={{ padding: 16, cursor: deviceConsent && metalsValid ? "pointer" : "default" }}
            onClick={() => {
              if (!deviceConsent || !metalsValid) return;
              setWhere(where === "here" ? "all" : "here");
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Cpu className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
              <span style={{ fontWeight: 600, color: "hsl(var(--foreground))" }}>Your dedicated metals</span>
              <span className={deviceConsent && metalsValid ? "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" : "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>
                {!deviceConsent ? "Permission required" : metalsValid ? `${hereCount} here` : metalsKnown ? "Not a valid option" : "Checking"}
              </span>
            </div>
            {!deviceConsent ? (
              <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                <DeviceInventoryConsent onChange={setDeviceConsent} />
              </div>
            ) : (
              <>
                <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "hsl(var(--muted-foreground))", textAlign: "left" }}>
                  {metals?.reason || "Your own Metal or GPU, when this machine has enough free capacity."}
                </p>
                {metals?.usableMemoryGb != null ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, metals.usedPercent ?? 0)}%`,
                          background: metalsValid ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs" style={{ color: "hsl(var(--muted-foreground))", textAlign: "left" }}>
                      {metals.remainingMemoryGb ?? 0} GB free of {metals.usableMemoryGb} GB
                      {" · "}
                      {metals.slotsUsed} of {metals.slotsMax} dedicated slots in use
                    </p>
                  </div>
                ) : null}
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <DeviceInventoryConsent onChange={setDeviceConsent} />
                </div>
              </>
            )}
          </div>
        </div>

        <p className="mt-3 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          {whereHint}
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          {(
            [
              ["open", "Open weight"],
              ["live", `Live (${liveOpenCount})`],
              ["new", `New (${newCount})`],
              ["all", "All"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" data-active={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by id, name, provider…"
          className="input max-w-md flex-1 min-w-[200px]"
          aria-label="Filter models"
        />
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 ml-auto">
          <button type="button" data-active={view === "grid"} onClick={() => setView("grid")} aria-label="Grid">
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button type="button" data-active={view === "table"} onClick={() => setView("table")} aria-label="Table">
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-error mb-4" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center gap-2" style={{ color: "hsl(var(--muted-foreground))" }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading models…</span>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-lg"
              data-active={selected?.id === m.id}
              onClick={() => setSelected(m)}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <ModelMark name={m.label || m.id} provider={m.provider} modelId={m.id} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 600, color: "hsl(var(--foreground))", fontSize: 15 }}>{m.label}</div>
                    {m.isNew && <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">New</span>}
                  </div>
                  <div className="font-mono" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                    {m.id}
                  </div>
                </div>
              </div>
              <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, color: "hsl(var(--muted-foreground))" }}>
                {modelBlurb(m)}
              </p>
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={m.status === "live" ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400" : "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>
                  {m.status === "live" && <span className="inline-block rounded-full bg-emerald-500" style={{ width: 6, height: 6 }} />}
                  {statusLabel(m.status)}
                </span>
                <span className={modelLocation(m) === "here" ? "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" : "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>
                  {locationLabel(modelLocation(m))}
                </span>
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{m.provider}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                  {formatPer1M(m.pricePer1MInputUsd)} / {formatPer1M(m.pricePer1MOutputUsd)}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm" style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
              No models match your filter.
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header-cell">Model ID</th>
                <th className="table-header-cell">Name</th>
                <th className="table-header-cell">Where</th>
                <th className="table-header-cell">Status</th>
                <th className="table-header-cell">$/1M in</th>
                <th className="table-header-cell">$/1M out</th>
                <th className="table-header-cell text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="table-row" onClick={() => setSelected(m)} style={{ cursor: "pointer" }}>
                  <td className="table-cell font-mono text-sm" style={{ color: "hsl(var(--foreground))" }}>
                    {m.id}
                    {m.isNew && (
                      <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "hsl(var(--accent))", color: "hsl(var(--primary))" }}>
                        New
                      </span>
                    )}
                  </td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                    <div>{m.label}</div>
                    <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {m.provider}
                      {m.family === "open_weight" ? " · open weight" : ""}
                    </div>
                  </td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>{locationLabel(modelLocation(m))}</td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>{statusLabel(m.status)}</td>
                  <td className="table-cell font-mono text-xs">{formatPer1M(m.pricePer1MInputUsd)}</td>
                  <td className="table-cell font-mono text-xs">{formatPer1M(m.pricePer1MOutputUsd)}</td>
                  <td className="table-cell text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); copyId(m.id); }}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
                      style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                    >
                      {copiedId === m.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === m.id ? "Copied" : "Copy ID"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && models.length > 0 && (
        <p className="mt-5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Showing {filtered.length} of {models.length} models.
        </p>
      )}

      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            />
            <motion.aside
              className="fixed right-0 top-0 z-[70] flex h-screen w-[min(420px,100vw)] flex-col border-l border-border bg-card shadow-xl"
              initial={{ x: 28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
            >
              <div style={{ padding: "22px 22px 16px", display: "flex", gap: 12, alignItems: "flex-start", borderBottom: "1px solid hsl(var(--border))" }}>
                <ModelMark name={selected.label || selected.id} provider={selected.provider} modelId={selected.id} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, color: "hsl(var(--foreground))" }}>{selected.label}</div>
                  <div className="font-mono" style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{selected.id}</div>
                </div>
                <button type="button" className="md-icon-btn" onClick={() => setSelected(null)} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Health</div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={selected.status === "live" ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400" : "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>
                      {selected.status === "live" && <span className="inline-block rounded-full bg-emerald-500" style={{ width: 6, height: 6 }} />}
                      {statusLabel(selected.status)}
                    </span>
                    <span className={modelLocation(selected) === "here" ? "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" : "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"}>
                      {locationLabel(modelLocation(selected))}
                    </span>
                    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{selected.origin || "catalog"}</span>
                  </div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "hsl(var(--muted-foreground))" }}>{modelBlurb(selected)}</p>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Rates · $ / 1M tokens</div>
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm" style={{ padding: 14 }}>
                      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Input</div>
                      <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginTop: 4 }}>{formatPer1M(selected.pricePer1MInputUsd)}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm" style={{ padding: 14 }}>
                      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Output</div>
                      <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginTop: 4 }}>{formatPer1M(selected.pricePer1MOutputUsd)}</div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Where it runs</div>
                  <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "hsl(var(--background))", color: "hsl(var(--muted-foreground))", fontSize: 14 }}>
                    {modelLocation(selected) === "here"
                      ? "Your dedicated metals — weights stay on this machine."
                      : "Native on Ochieng & Co cloud services."}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Provider</div>
                  <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "hsl(var(--background))", color: "hsl(var(--muted-foreground))", fontSize: 14 }}>
                    {selected.provider}{selected.family === "open_weight" ? " · open weight" : ""}
                  </div>
                </div>
                <DeviceSupportPanel key={selected.id} modelId={selected.id} />
              </div>
              <div style={{ marginTop: "auto", padding: 18, borderTop: "1px solid hsl(var(--border))", display: "flex", gap: 8 }}>
                <button type="button" className="btn-secondary" onClick={() => copyId(selected.id)} style={{ flex: 1 }}>
                  {copiedId === selected.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedId === selected.id ? "Copied" : "Copy ID"}
                </button>
                {(selected.status === "dedicated" || selected.status === "warming") ? (
                  <Link href="/dashboard/deployments/new" className="btn-primary" style={{ flex: 1, justifyContent: "center" }}>
                    Download & run
                  </Link>
                ) : (
                  <Link href={`/dashboard/playground?model=${encodeURIComponent(selected.id)}`} className="btn-primary" style={{ flex: 1, justifyContent: "center" }}>
                    <Play className="h-4 w-4" /> Try
                  </Link>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
