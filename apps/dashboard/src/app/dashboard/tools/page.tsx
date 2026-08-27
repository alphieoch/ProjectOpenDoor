"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Wrench } from "lucide-react";
import { MotionOverlay, MotionPress, Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/ui/page-header";
import {
  SEARCH_TOOL_ID,
  normalizeSearchResult,
  type SearchCitation,
} from "@/lib/tools/search-contract";
import { useI18n } from "@/components/i18n/i18n-provider";

type ToolRow = {
  id: string;
  name: string;
  description: string;
  group: string;
  endpoint: string;
  cost: { label: string; perCallCents: number };
  monthlyAddon: string | null;
  addonActive: boolean;
  includedInPlan?: boolean;
  status: "enabled" | "available";
  enabledAt: string | null;
};

type InvokeResult = {
  answer?: string;
  citations?: SearchCitation[];
  step?: { text?: string; results?: SearchCitation[]; error?: string };
  chargedCents?: number;
  error?: string;
};

function toolReady(tool: ToolRow | undefined) {
  return Boolean(tool && (tool.status === "enabled" || tool.addonActive || tool.includedInPlan));
}

function toolBadge(tool: ToolRow) {
  if (tool.includedInPlan) return "Included";
  if (tool.addonActive) return "Add-on";
  if (tool.status === "enabled") return "Enabled";
  return "Available";
}

function citationHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ToolsPage() {
  const { t } = useI18n();
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [invokeId, setInvokeId] = useState<string | null>(null);
  const [result, setResult] = useState<InvokeResult | null>(null);
  const [searchResult, setSearchResult] = useState<{
    answer: string;
    citations: SearchCitation[];
    chargedCents?: number;
  } | null>(null);
  const [spendableCents, setSpendableCents] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(false);

  const searchTool = tools.find((tool) => tool.id === SEARCH_TOOL_ID);
  const catalogTools = tools.filter((tool) => tool.id !== SEARCH_TOOL_ID);

  const load = useCallback(async () => {
    setError(null);
    try {
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
    } catch {
      setError("Could not load tools. Check your connection and try again.");
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function enable(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/tools/${encodeURIComponent(id)}`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error || "Could not enable this tool");
      setConfirmId(null);
    } catch {
      setError("Could not enable this tool. Check your connection and try again.");
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function disable(id: string) {
    if (!confirm("Disable this tool for the org? Later calls will be rejected until you enable it again.")) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/tools/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error || "Could not disable this tool");
    } catch {
      setError("Could not disable this tool. Check your connection and try again.");
    } finally {
      setBusyId(null);
      await load();
    }
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
    try {
      const res = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/invoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as InvokeResult;
      if (!res.ok) setError(data.error || "Tool call failed");
      setResult(data);
    } catch {
      setError("Tool call failed. Check your connection and try again.");
    } finally {
      setInvokeId(null);
      await load();
    }
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (!query || !searchTool) return;
    setInvokeId(SEARCH_TOOL_ID);
    setSearchResult(null);
    setError(null);
    const payload = JSON.stringify({ query });
    try {
      let res = await fetch("/api/tools/search", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (res.status === 404) {
        res = await fetch(`/api/tools/${SEARCH_TOOL_ID}/invoke`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
      }
      const data = (await res.json().catch(() => ({}))) as InvokeResult & { error?: string };
      if (!res.ok) {
        setError(data.error || "Search failed");
        return;
      }
      const parsed = normalizeSearchResult(data);
      setSearchResult({
        answer: parsed?.answer || "",
        citations: parsed?.citations || [],
        chargedCents: typeof data.chargedCents === "number" ? data.chargedCents : undefined,
      });
    } catch {
      setError("Search failed. Check your connection and try again.");
    } finally {
      setInvokeId(null);
      await load();
    }
  }

  const confirmTool = tools.find((t) => t.id === confirmId) || null;

  return (
    <div>
      <PageHeader
        eyebrow="Build"
        title="Tools"
        description="First-party tools we ship — the same catalog as Workflow. Enable for your org, see the usage cost, then call them. Spend follows Billing credits. Enterprise includes Search (Vertex-backed, no per-query debit). Site admins are unlimited."
      />

      {error ? (
        <div className="alert-error mb-4 text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {spendableCents != null && (
        <p className="mb-4 text-sm text-muted-foreground">
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
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tools.length === 0 ? (
        <div className="card p-16 text-center">
          <Wrench className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 font-medium text-foreground">No tools in the catalog</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The first-party catalog did not load. Refresh once — nothing is invented here.
          </p>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <Stagger className="space-y-4" appear="fade">
          {searchTool ? (
            <StaggerItem>
            <section className="card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                    <Search className="h-4 w-4" />
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em]">
                      OpenDoor Search
                    </span>
                  </div>
                  <h2 className="font-semibold text-foreground">{searchTool.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("tools.searchOneLiner")}</p>
                </div>
                <span
                  className={
                    toolReady(searchTool) ? "badge-success" : "badge-neutral"
                  }
                >
                  {toolBadge(searchTool)}
                </span>
              </div>
              <p className="font-mono text-sm text-foreground">
                {searchTool.cost.label}
                {searchTool.monthlyAddon ? ` · ${searchTool.monthlyAddon}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                Ask a question. We return a synthesized answer and the pages we cited
                on OpenDoor’s Vertex stack.
                {searchTool.includedInPlan
                  ? " Included with Enterprise — no per-query debit."
                  : " Usage debits org credits on success — site admins are not charged."}
              </p>

              {toolReady(searchTool) ? (
                <div className="space-y-3">
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-foreground">Question</span>
                    <textarea
                      className="input w-full min-h-[96px]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="What should OpenDoor Search look up?"
                    />
                  </label>
                  {searchResult && !searchResult.answer && searchResult.citations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No answer or citations came back for that question. Try a more specific query — we do not invent results.
                    </p>
                  ) : null}
                  {searchResult?.answer ? (
                    <div
                      className="rounded-lg border border-border bg-card p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap"
                    >
                      {searchResult.answer}
                    </div>
                  ) : null}
                  {searchResult?.citations.length ? (
                    <div>
                      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Citations
                      </h3>
                      <ol className="space-y-2">
                        {searchResult.citations.map((hit) => (
                          <li key={hit.url} className="text-sm">
                            <a
                              href={hit.url}
                              className="font-medium underline underline-offset-2"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {hit.title || hit.url}
                            </a>
                            <p className="text-xs text-muted-foreground">{citationHost(hit.url)}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {typeof searchResult?.chargedCents === "number" ? (
                    <p className="text-xs text-muted-foreground">
                      Charged{" "}
                      {searchResult.chargedCents === 0
                        ? "$0 (unlimited or add-on)"
                        : `$${(searchResult.chargedCents / 100).toFixed(2)}`}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <MotionPress>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!searchQuery.trim() || invokeId === SEARCH_TOOL_ID}
                      onClick={() => void runSearch()}
                    >
                      {invokeId === SEARCH_TOOL_ID
                        ? "Searching…"
                        : searchTool.includedInPlan
                          ? "Search"
                          : `Search · ${searchTool.cost.label}`}
                    </button>
                    </MotionPress>
                    {searchTool.status === "enabled" ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={busyId === SEARCH_TOOL_ID}
                        onClick={() => void disable(SEARCH_TOOL_ID)}
                      >
                        Disable
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Visible here at {searchTool.cost.label}. Run stays off until you enable it or cover
                    it with the monthly add-on.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyId === SEARCH_TOOL_ID}
                      onClick={() => setConfirmId(SEARCH_TOOL_ID)}
                    >
                      {busyId === SEARCH_TOOL_ID ? "Enabling…" : "Enable to use"}
                    </button>
                    <Link href="/dashboard/billing" className="btn-ghost">
                      Billing
                    </Link>
                  </div>
                </div>
              )}
            </section>
            </StaggerItem>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {catalogTools.map((tool) => (
              <StaggerItem key={tool.id}>
              <div className="card p-5 flex flex-col gap-3 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-foreground">{tool.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                  </div>
                  <span
                    className={
                      tool.status === "enabled" || tool.addonActive || tool.includedInPlan
                        ? "badge-success"
                        : "badge-neutral"
                    }
                  >
                    {toolBadge(tool)}
                  </span>
                </div>
                <p className="font-mono text-sm text-foreground">
                  {tool.cost.label}
                  {tool.monthlyAddon ? ` · ${tool.monthlyAddon}` : ""}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{tool.endpoint}</p>
                <div className="mt-auto flex flex-wrap gap-2">
                  {tool.status === "enabled" || tool.addonActive || tool.includedInPlan ? (
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
              </StaggerItem>
            ))}
          </div>
        </Stagger>
      )}

      <MotionOverlay
        open={Boolean(confirmTool && (confirmTool.id !== SEARCH_TOOL_ID || !toolReady(confirmTool)))}
        onDismiss={() => setConfirmId(null)}
        overlayClassName="bg-black/45"
        panelClassName="max-w-md"
        ariaLabel={confirmTool ? `${confirmTool.name}` : "Tool"}
      >
        {confirmTool ? (
          <div className="card w-full p-6">
            <h2 className="section-title">
              {confirmTool.status === "enabled" || confirmTool.addonActive || confirmTool.includedInPlan
                ? "Try"
                : "Enable"}{" "}
              {confirmTool.name}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirmTool.includedInPlan
                ? "Included with Enterprise. Vertex-backed Search is not debited per query."
                : `Usage is ${confirmTool.cost.label}. That amount is debited from org credits on each call${
                    confirmTool.addonActive ? " (monthly add-on covers this one)" : ""
                  }. Site admins are not charged.`}
            </p>
            {confirmTool.status !== "enabled" && !confirmTool.addonActive && !confirmTool.includedInPlan ? (
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
                  <pre className="max-h-48 overflow-auto rounded-lg border border-border p-3 text-xs">
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
                  <p className="text-xs text-muted-foreground">
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
        ) : null}
      </MotionOverlay>
    </div>
  );
}
