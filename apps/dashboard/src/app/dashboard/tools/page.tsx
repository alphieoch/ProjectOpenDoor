"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Wrench } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

type ToolRow = {
  id: string;
  name: string;
  description: string;
  group: string;
  endpoint: string;
  cost: { label: string; perCallCents: number };
  monthlyAddon: string | null;
  addonActive: boolean;
  status: "enabled" | "available";
  enabledAt: string | null;
};

type InvokeResult = {
  step?: { text?: string; results?: Array<{ title: string; url: string }>; error?: string };
  chargedCents?: number;
  error?: string;
};

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [invokeId, setInvokeId] = useState<string | null>(null);
  const [result, setResult] = useState<InvokeResult | null>(null);
  const [spendableCents, setSpendableCents] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/tools", { credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as {
      tools?: ToolRow[];
      error?: string;
      spendableCents?: number;
      unlimited?: boolean;
    };
    if (!res.ok) {
      setError(data.error || "Failed to load tools");
      setTools([]);
    } else {
      setTools(Array.isArray(data.tools) ? data.tools : []);
      setSpendableCents(typeof data.spendableCents === "number" ? data.spendableCents : 0);
      setUnlimited(Boolean(data.unlimited));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function enable(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/tools/${encodeURIComponent(id)}`, {
      method: "POST",
      credentials: "include",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setError(data.error || "Could not enable this tool");
    setConfirmId(null);
    setBusyId(null);
    await load();
  }

  async function disable(id: string) {
    if (!confirm("Disable this tool for the org? Later calls will be rejected until you enable it again.")) {
      return;
    }
    setBusyId(id);
    const res = await fetch(`/api/tools/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setError(data.error || "Could not disable this tool");
    setBusyId(null);
    await load();
  }

  async function invoke(tool: ToolRow) {
    if (!input.trim()) return;
    setInvokeId(tool.id);
    setResult(null);
    setError(null);
    const body: Record<string, string> = { query: input.trim(), prompt: input.trim() };
    if (tool.id === "code_execution") {
      body.code = input.trim();
      body.language = "javascript";
    }
    if (tool.id === "document_analysis") body.fileId = input.trim();
    const res = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/invoke`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as InvokeResult;
    if (!res.ok) setError(data.error || "Tool call failed");
    setResult(data);
    setInvokeId(null);
    await load();
  }

  const confirmTool = tools.find((t) => t.id === confirmId) || null;

  return (
    <div>
      <PageHeader
        eyebrow="Build"
        title="Tools"
        description="First-party tools we ship — the same catalog as Workflow. Enable for your org, see the usage cost, then call them. Spend follows Billing credits (site admins are unlimited)."
      />

      {error ? (
        <div className="alert-error mb-4 text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {spendableCents != null && (
        <p className="mb-4 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          {unlimited
            ? "Unlimited spend on this workspace."
            : `Spendable credit: $${(spendableCents / 100).toFixed(2)}.`}{" "}
          <Link href="/dashboard/billing" className="underline underline-offset-2">
            Billing
          </Link>
        </p>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
        </div>
      ) : tools.length === 0 ? (
        <div className="card p-16 text-center">
          <Wrench className="mx-auto h-10 w-10" style={{ color: "hsl(var(--muted-foreground))" }} />
          <h3 className="mt-4 font-medium" style={{ color: "hsl(var(--foreground))" }}>
            No tools in the catalog
          </h3>
          <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            The first-party catalog did not load. Refresh once — nothing is invented here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tools.map((tool) => (
            <div key={tool.id} className="card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                    {tool.name}
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {tool.description}
                  </p>
                </div>
                <span
                  className={
                    tool.status === "enabled" || tool.addonActive ? "badge-success" : "badge-neutral"
                  }
                >
                  {tool.addonActive ? "Add-on" : tool.status === "enabled" ? "Enabled" : "Available"}
                </span>
              </div>
              <p className="font-mono text-sm" style={{ color: "hsl(var(--foreground))" }}>
                {tool.cost.label}
                {tool.monthlyAddon ? ` · ${tool.monthlyAddon}` : ""}
              </p>
              <p className="font-mono text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                {tool.endpoint}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                {tool.status === "enabled" || tool.addonActive ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={busyId === tool.id}
                      onClick={() => {
                        setInput("");
                        setResult(null);
                        setConfirmId(tool.id === confirmId ? null : tool.id);
                      }}
                    >
                      Try
                    </button>
                    {tool.status === "enabled" ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={busyId === tool.id}
                        onClick={() => void disable(tool.id)}
                      >
                        Disable
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={busyId === tool.id}
                    onClick={() => setConfirmId(tool.id)}
                  >
                    {busyId === tool.id ? "Enabling…" : "Request · see cost"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmTool && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setConfirmId(null)}
        >
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="section-title">{confirmTool.status === "enabled" || confirmTool.addonActive ? "Try" : "Enable"} {confirmTool.name}</h2>
            <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Usage is {confirmTool.cost.label}. That amount is debited from org credits on each call
              {confirmTool.addonActive ? " (monthly add-on covers this one)" : ""}.
              Site admins are not charged.
            </p>
            {confirmTool.status !== "enabled" && !confirmTool.addonActive ? (
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="md-btn-outlined px-4 py-2 text-sm" onClick={() => setConfirmId(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busyId === confirmTool.id}
                  onClick={() => void enable(confirmTool.id)}
                >
                  Confirm enable
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">
                    {confirmTool.id === "code_execution"
                      ? "JavaScript"
                      : confirmTool.id === "document_analysis"
                        ? "File id"
                        : "Query / prompt"}
                  </span>
                  <textarea
                    className="input w-full min-h-[96px]"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      confirmTool.id === "code_execution"
                        ? "console.log('hello')"
                        : confirmTool.id === "document_analysis"
                          ? "file_…"
                          : "What should this tool run?"
                    }
                  />
                </label>
                {result?.step?.text ? (
                  <pre className="max-h-48 overflow-auto rounded-lg border p-3 text-xs" style={{ borderColor: "hsl(var(--border))" }}>
                    {result.step.text}
                  </pre>
                ) : null}
                {result?.step?.results?.length ? (
                  <ul className="space-y-1 text-sm">
                    {result.step.results.map((hit) => (
                      <li key={hit.url}>
                        <a href={hit.url} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                          {hit.title || hit.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {typeof result?.chargedCents === "number" ? (
                  <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Charged {result.chargedCents === 0 ? "$0 (unlimited or add-on)" : `$${(result.chargedCents / 100).toFixed(2)}`}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <button type="button" className="md-btn-outlined px-4 py-2 text-sm" onClick={() => setConfirmId(null)}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!input.trim() || invokeId === confirmTool.id}
                    onClick={() => void invoke(confirmTool)}
                  >
                    {invokeId === confirmTool.id ? "Running…" : `Run · ${confirmTool.cost.label}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
