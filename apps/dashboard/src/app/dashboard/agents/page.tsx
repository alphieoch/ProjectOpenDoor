"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Plus, Shield, Sparkles, Workflow } from "lucide-react";
import { AiCrest } from "@/components/ui/ai-crest";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AGENT_RUNTIME_CATALOG, type AgentRuntimeId } from "@/lib/agents/runtimes";

type Agent = {
  id: string;
  name: string;
  runtime: AgentRuntimeId;
  runtimeName: string;
  modelId: string;
  status: string;
  statusMessage?: string | null;
  createdAt: string;
};

type CatalogOption = { id: string; label: string; provider: string; modality?: string; ready?: boolean };

type AgentsAddon = {
  active: boolean;
  status: string;
  includedInPlan: boolean;
  amountUsd: number;
  configured: boolean;
  name: string;
};

const RUNTIME_ICON: Record<AgentRuntimeId, typeof Bot> = {
  openclaw: Workflow,
  hermes: Bot,
  nemoclaw: Shield,
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    running: "badge-success",
    starting: "badge-warning",
    pending: "badge-warning",
    stopped: "badge-neutral",
    failed: "badge-error",
  };
  return map[status] || "badge-neutral";
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<CatalogOption[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState<AgentRuntimeId>("openclaw");
  const [modelId, setModelId] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [addon, setAddon] = useState<AgentsAddon | null>(null);
  const [addonLoading, setAddonLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [a, m, b] = await Promise.all([
      fetch("/api/agents", { credentials: "include" }),
      fetch("/api/models/available", { credentials: "include" }),
      fetch("/api/billing/balance", { credentials: "include" }),
    ]);
    if (a.ok) {
      const data = await a.json();
      setAgents(data.agents || []);
      if (data.addon) setAddon(data.addon);
    }
    if (m.ok) {
      const rows = ((await m.json()).models || []) as CatalogOption[];
      const chat = rows.filter((row) => !row.modality || row.modality === "chat");
      setModels(chat);
      setModelId((prev) => prev || chat.find((row) => row.ready)?.id || chat[0]?.id || "");
    }
    if (b.ok) {
      const bal = await b.json();
      setCredits(Number(bal.creditsUsdCents || 0));
    }
    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("addon") === "success") {
      setNotice("Agents add-on is on. You can create OpenClaw, Hermes, or NemoClaw agents on this workspace.");
    } else if (params.get("addon") === "canceled") {
      setNotice("Checkout canceled. No charge was made.");
    }
    load();
  }, []);

  async function subscribeAddon() {
    setAddonLoading(true);
    setError(null);
    const res = await fetch("/api/billing/addons/agents", { method: "POST", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    setAddonLoading(false);
    if (data.alreadyActive) {
      await load();
      return;
    }
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setError(data.error || "Could not start Agents checkout");
  }

  function openCreate() {
    const profile = AGENT_RUNTIME_CATALOG.find((r) => r.id === runtime);
    setName("");
    setSystemPrompt(profile?.defaultPrompt || "");
    setError(null);
    setOpen(true);
  }

  function pickRuntime(id: AgentRuntimeId) {
    setRuntime(id);
    const profile = AGENT_RUNTIME_CATALOG.find((r) => r.id === id);
    setSystemPrompt(profile?.defaultPrompt || "");
  }

  async function create(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, runtime, modelId, systemPrompt }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not start the agent");
      return;
    }
    setOpen(false);
    router.push(`/dashboard/agents/${data.agent.id}`);
  }

  const selected = AGENT_RUNTIME_CATALOG.find((r) => r.id === runtime);
  const locked = Boolean(addon && !addon.active);
  const price = addon?.amountUsd ?? 20;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Agents"
        description="Create your own agent. Pick OpenClaw, Hermes, or NemoClaw, choose the LLM, and spin it up on this workspace's quota."
        actions={
          locked ? (
            <button
              type="button"
              onClick={subscribeAddon}
              disabled={addonLoading || addon?.configured === false}
              className="btn-primary shrink-0"
            >
              {addonLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Subscribe · ${price}/mo
            </button>
          ) : (
            <button type="button" onClick={openCreate} className="btn-primary shrink-0">
              <Plus className="h-4 w-4" /> Create agent
            </button>
          )
        }
      />

      {notice && (
        <div
          className="mb-4 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--muted-foreground))" }}
        >
          {notice}
        </div>
      )}

      {locked && (
        <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm mb-6 p-6">
          <p className="text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Add-on</p>
          <h3 className="mt-1 text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Agents · ${price}/month
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "hsl(var(--muted-foreground))" }}>
            Unlock hosted OpenClaw, Hermes, and NemoClaw on this workspace. This is a separate
            subscription from Pro or Team. Agent tokens still debit the same prepaid quota as
            Playground and the API.
          </p>
          {error && (
            <p className="mt-3 text-sm" style={{ color: "hsl(var(--destructive))" }}>{error}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={subscribeAddon}
              disabled={addonLoading || addon?.configured === false}
              className="btn-primary"
            >
              {addonLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {addon?.configured === false ? "Checkout not configured" : `Subscribe · $${price}/mo`}
            </button>
            <Link href="/dashboard/billing" className="btn-ghost">
              Billing
            </Link>
          </div>
        </div>
      )}

      {credits !== null && (
        <p className="mb-6 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Quota available: <strong style={{ color: "hsl(var(--foreground))" }}>${(credits / 100).toFixed(2)}</strong>
          {" · "}
          Agent tokens debit the same prepaid balance as Playground and the API.
        </p>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
        </div>
      ) : agents.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="mx-auto flex justify-center">
            <AiCrest mood="idle" surface="agent" size={45} />
          </div>
          <h3 className="mt-4 font-medium" style={{ color: "hsl(var(--foreground))" }}>No agents yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Stand up OpenClaw, Hermes, or NVIDIA NemoClaw on any catalog model. Usage comes off this workspace.
          </p>
          {locked ? (
            <button
              type="button"
              onClick={subscribeAddon}
              disabled={addonLoading || addon?.configured === false}
              className="btn-primary mt-5 inline-flex"
            >
              {addonLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Subscribe to create agents
            </button>
          ) : (
            <button type="button" onClick={openCreate} className="btn-primary mt-5 inline-flex">
              <Plus className="h-4 w-4" /> Create your first agent
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((agent) => {
            return (
              <Link
                key={agent.id}
                href={`/dashboard/agents/${agent.id}`}
                className="rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-lg p-6"
                style={{ textDecoration: "none" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center">
                      <AiCrest
                        mood={agent.status === "failed" ? "error" : agent.status === "running" ? "ready" : "idle"}
                        surface="agent"
                        size={22}
                      />
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>{agent.name}</p>
                      <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {agent.runtimeName} · {agent.modelId}
                      </p>
                    </div>
                  </div>
                  <span className={statusBadge(agent.status)}>{agent.status}</span>
                </div>
                {agent.statusMessage && (
                  <p className="mt-3 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{agent.statusMessage}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create agent</DialogTitle>
            <DialogDescription>
              Choose a runtime, pick the model it should call, then we spin it up on your quota.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Runtime</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {AGENT_RUNTIME_CATALOG.map((item) => {
                  const Icon = RUNTIME_ICON[item.id];
                  const active = runtime === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => pickRuntime(item.id)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        active ? "border-[hsl(var(--foreground))] bg-accent" : "border-border hover:border-border",
                      )}
                    >
                      <Icon className="mb-2 h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
                      <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>{item.name}</p>
                      <p className="mt-1 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>{item.maker}</p>
                      <p className="mt-2 text-xs leading-5" style={{ color: "hsl(var(--muted-foreground))" }}>{item.tagline}</p>
                    </button>
                  );
                })}
              </div>
              {selected && (
                <p className="mt-3 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{selected.description}</p>
              )}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={selected ? `${selected.name} desk` : "Support agent"}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Model</span>
              <select
                required
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
              >
                {models.length === 0 && <option value="">No chat models available</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {m.provider}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Instructions</span>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
              />
            </label>

            {error && (
              <p className="text-sm" style={{ color: "hsl(var(--destructive))" }}>{error}</p>
            )}

            <DialogFooter>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving || !modelId}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Spin up
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
