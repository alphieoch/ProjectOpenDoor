"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { LifeBuoy, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

type Severity = "low" | "medium" | "high" | "critical";

type Ticket = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  createdAt: string;
  state: string;
};

function posthogRequestHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  try {
    const sid = posthog.get_session_id();
    const did = posthog.get_distinct_id();
    if (typeof sid === "string" && sid) h["x-posthog-session-id"] = sid;
    if (typeof did === "string" && did) h["x-posthog-distinct-id"] = did;
  } catch {
    /* PostHog optional */
  }
  return h;
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [configured, setConfigured] = useState(true);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");

  async function loadTickets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to load tickets.");
        setTickets([]);
        return;
      }
      setConfigured(data.configured !== false);
      setConfigMessage(typeof data.message === "string" ? data.message : null);
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch {
      setError("Failed to load tickets.");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/support", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...posthogRequestHeaders() },
      body: JSON.stringify({
        subject,
        body,
        severity,
        pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
        source: "support_page",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to create ticket.");
      setSaving(false);
      return;
    }
    setSubject("");
    setBody("");
    setSeverity("medium");
    setSaving(false);
    await loadTickets();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Support"
        description="Open a ticket with the OpenDoor team. We attach your org, email, and PostHog session when available."
      />

      {!configured && (
        <div className="mb-6 alert-error">
          <p className="font-medium">configure LINEAR_API_KEY</p>
          <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            {configMessage || "Set LINEAR_API_KEY and LINEAR_SUPPORT_TEAM_ID, then reload."}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 alert-error">
          <p className="font-medium">{error}</p>
        </div>
      )}

      <div className="card p-6 mb-8">
        <h2 className="section-title mb-4">New ticket</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Subject
            </label>
            <input
              className="input w-full"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={200}
              placeholder="Brief summary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Details
            </label>
            <textarea
              className="input w-full min-h-[140px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              placeholder="What happened, and what did you expect?"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Severity
            </label>
            <select
              className="input w-full max-w-xs"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={saving || !configured}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LifeBuoy className="h-4 w-4" />}
            {saving ? "Sending…" : "Submit ticket"}
          </button>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="section-title mb-4">Recent tickets</h2>
        {loading ? (
          <p className="page-desc">Loading tickets…</p>
        ) : tickets.length === 0 ? (
          <p className="page-desc">No tickets yet for this organization. Submit one above and it will list here.</p>
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={t.url} target="_blank" rel="noreferrer" className="font-medium underline">
                  {t.identifier} · {t.title}
                </a>
                <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {t.state} · {new Date(t.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
