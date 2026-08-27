"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { BYOK_PROVIDER_SLUGS, type PublicByokKey } from "@opendoor/shared";

export function ByokPanel({ heading = "Bring your own key" }: { heading?: string }) {
  const [keys, setKeys] = useState<PublicByokKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerSlug, setProviderSlug] = useState<(typeof BYOK_PROVIDER_SLUGS)[number]>("openai");
  const [secret, setSecret] = useState("");
  const [label, setLabel] = useState("");
  const [alwaysUse, setAlwaysUse] = useState(false);

  const existingForProvider = keys.find((row) => row.providerSlug === providerSlug);

  async function fetchKeys() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/byok", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
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

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/byok", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerSlug,
        apiKey: secret,
        label: label.trim() || undefined,
        alwaysUse,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to save provider key.");
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
      return;
    }
    await fetchKeys();
  }

  return (
    <div className="card p-6">
      <h2 className="section-title mb-1">{heading}</h2>
      <p className="mb-4 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
        Paste an OpenAI, Anthropic, Groq, or other provider secret. It is encrypted at rest in{" "}
        <code className="font-mono text-xs">organization_provider_keys</code> — the same table the
        gateway decrypts. After save we only show a prefix.{" "}
        <Link href="/docs/how-it-works/byok" className="underline">
          BYOK docs
        </Link>
        .
      </p>
      {error && (
        <p className="mb-3 text-sm" role="alert" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
      <form onSubmit={saveKey} className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-sm">
          <span className="mb-1.5 block font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
            Provider
          </span>
          <select
            className="input"
            value={providerSlug}
            onChange={(e) => setProviderSlug(e.target.value as (typeof BYOK_PROVIDER_SLUGS)[number])}
          >
            {BYOK_PROVIDER_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:min-w-[16rem] sm:flex-1">
          <span className="mb-1.5 block font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
            Provider API key
          </span>
          <input
            type="password"
            className="input w-full"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
            Label
          </span>
          <input
            type="text"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Production"
          />
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          <input
            type="checkbox"
            checked={alwaysUse}
            onChange={(e) => setAlwaysUse(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />
          Always use
        </label>
        <button type="submit" disabled={saving || !secret.trim()} className="btn-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {saving ? "Saving…" : existingForProvider ? "Rotate key" : "Add key"}
        </button>
      </form>
      {existingForProvider ? (
        <p className="mb-4 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {existingForProvider.providerSlug} already has {existingForProvider.keyPrefix}. Saving
          replaces it; the old secret stops working immediately.
        </p>
      ) : null}
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="table-header-cell">Provider</th>
            <th className="table-header-cell">Prefix</th>
            <th className="table-header-cell">Label</th>
            <th className="table-header-cell">Always</th>
            <th className="table-header-cell">Last used</th>
            <th className="table-header-cell text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
              </td>
            </tr>
          )}
          {!loading &&
            keys.map((row) => (
              <tr key={row.id} className="table-row">
                <td className="table-cell font-medium">{row.providerSlug}</td>
                <td className="table-cell font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {row.keyPrefix}
                </td>
                <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {row.label || "—"}
                </td>
                <td className="table-cell">{row.alwaysUse ? "Yes" : "No"}</td>
                <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : "Never"}
                </td>
                <td className="table-cell text-right">
                  <button
                    type="button"
                    onClick={() => revokeKey(row.id)}
                    className="btn-danger btn-sm"
                    aria-label={`Revoke ${row.providerSlug} key`}
                    title={`Revoke ${row.providerSlug} key`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          {!loading && keys.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                {error ? "No provider keys to show." : "No provider keys yet. Paste one above."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
