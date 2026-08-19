"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pause, Play, Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AiCrest } from "@/components/ui/ai-crest";
import { getAgentRuntime, type AgentRuntimeId } from "@/lib/agents/runtimes";

type Workspace = {
  memory: Array<{ id: string; kind: string; content: string; createdAt: string }>;
  skills: Array<{ id: string; name: string; source: string; createdAt: string }>;
  outbox: Array<{ id: string; channel: string; recipient: string; body: string; createdAt: string }>;
  audit: Array<{ id: string; action: string; detail: string; allowed: boolean; createdAt: string }>;
  probe: { ok: boolean; latencyMs: number; at: string; error?: string; modelsSeen?: number } | null;
  counts: { memory: number; skills: number; outbox: number };
};

type Agent = {
  id: string;
  name: string;
  runtime: AgentRuntimeId;
  runtimeName: string;
  modelId: string;
  status: string;
  statusMessage?: string | null;
  gatewayUrl: string;
  workspace: Workspace;
};

type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string | null;
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

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [addonActive, setAddonActive] = useState(true);
  const [addonAmount, setAddonAmount] = useState(20);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/agents/${id}`, { credentials: "include" });
    if (res.status === 404) {
      router.push("/dashboard/agents");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setAgent(data.agent);
      setMessages(data.messages || []);
      if (data.addon) {
        setAddonActive(Boolean(data.addon.active));
        setAddonAmount(Number(data.addon.amountUsd || 20));
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function setStatus(status: "running" | "stopped") {
    setBusy(true);
    const res = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setAgent(data.agent);
    else setChatError(data.error || "Could not update the agent");
    setBusy(false);
  }

  async function remove() {
    if (!confirm("Delete this agent and revoke its key?")) return;
    setBusy(true);
    const res = await fetch(`/api/agents/${id}`, { method: "DELETE", credentials: "include" });
    setBusy(false);
    if (res.ok) router.push("/dashboard/agents");
  }

  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    if (!input.trim() || !agent) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    setChatError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    const res = await fetch(`/api/agents/${id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message: text }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setChatError(data.error || "Chat failed");
      setSending(false);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setSending(false);
      return;
    }
    const decoder = new TextDecoder();
    let assistant = "";
    let buffer = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n");
      buffer = chunks.pop() || "";
      for (const line of chunks) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        try {
          const json = JSON.parse(payload) as { type?: string; content?: string; name?: string; ok?: boolean; detail?: string };
          if (json.type === "tool" && json.name) {
            setMessages((prev) => [
              ...prev.slice(0, -1),
              { role: "tool", content: `${json.name}${json.detail ? ` · ${json.detail}` : ""}`, toolName: json.name },
              prev[prev.length - 1] || { role: "assistant", content: assistant },
            ]);
          }
          if (json.type === "delta" && typeof json.content === "string") {
            assistant += json.content;
            setMessages((prev) => {
              const next = [...prev];
              const last = next.length - 1;
              if (next[last]?.role === "assistant") next[last] = { ...next[last], content: assistant };
              else next.push({ role: "assistant", content: assistant });
              return next;
            });
          }
        } catch {
          /* ignore */
        }
      }
    }
    setSending(false);
    const refreshed = await fetch(`/api/agents/${id}`, { credentials: "include" });
    if (refreshed.ok) {
      const data = await refreshed.json();
      setAgent(data.agent);
      if (Array.isArray(data.messages) && data.messages.length) setMessages(data.messages);
    }
  }

  if (loading || !agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
      </div>
    );
  }

  const runtime = getAgentRuntime(agent.runtime);
  const ws = agent.workspace;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title={agent.name}
        description={`${agent.runtimeName} on ${agent.modelId}. Tools, memory, and chat all hit the live gateway on this workspace quota.`}
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/agents" className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> All agents
            </Link>
            {agent.status === "running" ? (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStatus("stopped")}>
                <Pause className="h-4 w-4" /> Stop
              </button>
            ) : (
              <button type="button" className="btn-primary" disabled={busy || !addonActive} onClick={() => setStatus("running")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start
              </button>
            )}
            <button type="button" className="btn-ghost" disabled={busy} onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className={statusBadge(agent.status)}>{agent.status}</span>
        <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          {runtime?.maker} · {runtime?.tagline}
        </span>
        {ws.probe && (
          <span className="text-sm" style={{ color: ws.probe.ok ? "hsl(var(--muted-foreground))" : "hsl(var(--destructive))" }}>
            {ws.probe.ok
              ? `Gateway ${ws.probe.latencyMs}ms · ${ws.probe.modelsSeen ?? 0} models`
              : `Gateway down: ${ws.probe.error}`}
          </span>
        )}
      </div>
      {agent.statusMessage && (
        <p className="mb-6 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{agent.statusMessage}</p>
      )}
      {!addonActive && (
        <div
          className="mb-6 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--muted-foreground))" }}
        >
          Agents is a ${addonAmount}/month add-on. Subscribe to start or chat with this agent.{" "}
          <Link href="/dashboard/agents" className="underline">Go to Agents</Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm flex min-h-[420px] flex-col p-0">
          <div className="flex-1 space-y-3 overflow-y-auto p-5" style={{ maxHeight: 520 }}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <AiCrest mood="idle" surface="agent" size={45} />
                <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  This is a live {agent.runtimeName} session. Ask it to remember something, use a skill, or (for OpenClaw) queue a channel message.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={m.id || `${m.role}-${i}`}
                className="rounded-xl px-3 py-2 text-sm"
                style={{
                  background: m.role === "user" ? "hsl(var(--accent))" : "hsl(var(--background))",
                  color: "hsl(var(--foreground))",
                  border: "1px solid hsl(var(--border))",
                  opacity: m.role === "tool" ? 0.85 : 1,
                }}
              >
                <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {m.role === "tool" ? `tool · ${m.toolName || "run"}` : m.role}
                </p>
                <p className="whitespace-pre-wrap leading-6">{m.content}</p>
              </div>
            ))}
            <div ref={bottomRef} />
            {sending && (
              <div className="flex items-center gap-2 px-1 pb-1">
                <AiCrest mood="thinking" surface="agent" size="sm" />
                <span className="text-sm shimmer-text" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Thinking...
                </span>
              </div>
            )}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t p-3" style={{ borderColor: "hsl(var(--border))" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending || !addonActive || agent.status !== "running"}
              placeholder={!addonActive ? "Subscribe to the Agents add-on to chat" : agent.status === "running" ? "Message the agent…" : "Start the agent to chat"}
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
            />
            <button type="submit" className="btn-primary" disabled={sending || !addonActive || agent.status !== "running"}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          {chatError && (
            <div className="flex items-center gap-2 px-4 pb-3 text-sm" style={{ color: "hsl(var(--destructive))" }}>
              <AiCrest mood="error" surface="agent" size={16} />
              {chatError}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-5">
            <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Live workspace</h3>
            <p className="mt-2 text-sm leading-6" style={{ color: "hsl(var(--muted-foreground))" }}>
              {ws.counts.memory} memories · {ws.counts.skills} skills · {ws.counts.outbox} queued messages
            </p>
            {ws.skills.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                {ws.skills.map((s) => (
                  <li key={s.id}>· {s.name} <span style={{ color: "hsl(var(--muted-foreground))" }}>({s.source})</span></li>
                ))}
              </ul>
            )}
          </div>
          {ws.memory.length > 0 && (
            <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-5">
              <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Memory</h3>
              <ul className="mt-3 space-y-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                {ws.memory.slice(-6).map((m) => (
                  <li key={m.id}>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>[{m.kind}]</span> {m.content}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ws.outbox.length > 0 && (
            <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-5">
              <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Channel outbox</h3>
              <ul className="mt-3 space-y-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                {ws.outbox.slice(-5).map((m) => (
                  <li key={m.id}>
                    {m.channel} → {m.recipient}: {m.body}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ws.audit.length > 0 && (
            <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-5">
              <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Sandbox audit</h3>
              <ul className="mt-3 space-y-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                {ws.audit.slice(-5).map((m) => (
                  <li key={m.id}>
                    {m.allowed ? "allow" : "deny"} · {m.action} {m.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-5">
            <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Quota path</h3>
            <p className="mt-2 text-sm leading-6" style={{ color: "hsl(var(--muted-foreground))" }}>
              Completions go to <span className="font-mono">{agent.gatewayUrl}</span> with this agent&apos;s key. Spend shows up on Usage and Billing like any other API call.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
