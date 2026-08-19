"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface ByokKey {
  id: string;
  providerSlug: string;
  label: string | null;
  last4?: string;
  keyPrefix?: string;
  alwaysUse: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
}

const PROVIDER_SLUGS = [
  "vertex",
  "together",
  "openai",
  "anthropic",
  "google",
  "cohere",
  "mistral",
  "deepseek",
  "qwen",
  "groq",
  "xai",
  "azure-foundry",
  "cerebras",
  "perplexity",
];

function keyHint(row: ByokKey) {
  if (row.keyPrefix) return row.keyPrefix;
  if (row.last4) return `••••${row.last4}`;
  return "••••";
}

export default function ByokSettingsPage() {
  const [keys, setKeys] = useState<ByokKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expected, setExpected] = useState<unknown>(null);
  const [providerSlug, setProviderSlug] = useState("openai");
  const [secret, setSecret] = useState("");
  const [label, setLabel] = useState("");
  const [alwaysUse, setAlwaysUse] = useState(false);

  async function fetchKeys() {
    setLoading(true);
    setError(null);
    setExpected(null);
    try {
      const res = await fetch("/api/byok", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 501) {
        setKeys([]);
        setError(data.error || "Provider keys are not available yet.");
        setExpected(data.expected ?? null);
        return;
      }
      if (!res.ok) {
        setKeys([]);
        setError(data.error || "Failed to load provider keys.");
        return;
      }
      setKeys(Array.isArray(data.keys) ? data.keys : []);
    } catch {
      setKeys([]);
      setError("Failed to load provider keys.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchKeys();
  }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/byok", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerSlug,
        secret,
        apiKey: secret,
        label: label.trim() || undefined,
        alwaysUse,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to save provider key.");
      if (data.expected) setExpected(data.expected);
      setSaving(false);
      return;
    }
    setSecret("");
    setLabel("");
    setAlwaysUse(false);
    setSaving(false);
    await fetchKeys();
  }

  async function revokeKey(id: string) {
    if (!confirm("Remove this provider key? New requests will stop using it.")) return;
    const res = await fetch(`/api/byok/${id}`, { method: "DELETE", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to delete provider key.");
      if (data.expected) setExpected(data.expected);
      return;
    }
    await fetchKeys();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Provider keys"
        description="Bring your own provider API keys (BYOK). Secrets are stored on the server and never shown again — only the last four characters."
        actions={
          <Link href="/dashboard/settings" className="btn btn-sm">
            Back to settings
          </Link>
        }
      />

      {error && (
        <div className="mb-6 alert-error">
          <p className="font-medium">{error}</p>
          {expected != null && (
            <p className="mt-2 text-xs" style={{ opacity: 0.85 }}>
              Expected API shape:{" "}
              <code className="font-mono">{JSON.stringify(expected)}</code>
            </p>
          )}
        </div>
      )}

      <div className="card p-6">
        <h2 className="section-title mb-4">Add a provider key</h2>
        <form onSubmit={createKey} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Provider
            </label>
            <input
              list="byok-providers"
              value={providerSlug}
              onChange={(e) => setProviderSlug(e.target.value)}
              placeholder="openai"
              className="input max-w-sm"
              required
            />
            <datalist id="byok-providers">
              {PROVIDER_SLUGS.map((slug) => (
                <option key={slug} value={slug} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Production"
              className="input max-w-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Secret
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="sk-…"
              className="input max-w-sm"
              autoComplete="off"
              required
            />
            <p className="mt-1.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              The raw secret is sent once and never returned by the API.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={alwaysUse}
              onChange={(e) => setAlwaysUse(e.target.checked)}
              className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
            />
            <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Always use this key for this provider
            </span>
          </label>
          <button type="submit" disabled={saving || !secret.trim()} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {saving ? "Saving…" : "Save key"}
          </button>
        </form>
      </div>

      <div className="mt-6 card overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="table-header-cell">Provider</th>
              <th className="table-header-cell">Label</th>
              <th className="table-header-cell">Key</th>
              <th className="table-header-cell">Always use</th>
              <th className="table-header-cell">Last used</th>
              <th className="table-header-cell">Created</th>
              <th className="table-header-cell text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
                </td>
              </tr>
            )}
            {!loading &&
              keys.map((row) => (
                <tr key={row.id} className="table-row">
                  <td className="table-cell font-medium" style={{ color: "hsl(var(--foreground))" }}>
                    {row.providerSlug}
                  </td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {row.label || "—"}
                  </td>
                  <td className="table-cell font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {keyHint(row)}
                  </td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {row.alwaysUse ? "Yes" : "No"}
                  </td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="table-cell text-right">
                    <button
                      type="button"
                      onClick={() => revokeKey(row.id)}
                      className="btn-danger btn-sm"
                      aria-label={`Remove ${row.providerSlug} key`}
                      title={`Remove ${row.providerSlug} key`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && keys.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {error
                    ? "No provider keys to show."
                    : "No provider keys yet. Add one above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
