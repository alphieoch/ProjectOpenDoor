"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Key, Copy, Trash2, Check, Shield, ShieldCheck } from "lucide-react";
import posthog from "posthog-js";
import { PageHeader } from "@/components/ui/page-header";
import { ByokPanel } from "@/components/dashboard/byok-panel";
import type { ApiKeyQuota, PublicApiKey } from "@opendoor/shared";

type CatalogOption = { id: string; name: string; provider: string };

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<PublicApiKey[]>([]);
  const [quota, setQuota] = useState<ApiKeyQuota | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullAccess, setFullAccess] = useState(true);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);

  async function fetchKeys() {
    const res = await fetch("/api/keys", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setKeys(Array.isArray(data.keys) ? data.keys : []);
      setQuota(data.quota ?? null);
      setError(null);
    } else {
      setKeys([]);
      setQuota(null);
      setError(data.error || "Failed to load API keys");
    }
    setListLoading(false);
  }

  useEffect(() => {
    fetchKeys();
    fetch("/api/models/available", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((data) => {
        setCatalog(
          (data.models || []).map((m: { id: string; label: string; provider: string }) => ({
            id: m.id,
            name: m.label,
            provider: m.provider,
          }))
        );
      })
      .catch(() => {});
  }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const allowedModels = fullAccess ? null : selectedModels;
    const res = await fetch("/api/keys", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName, allowedModels }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.key === "string") {
      setNewKeyValue(data.key);
      localStorage.setItem("od_playground_api_key", data.key);
      setNewKeyName("");
      setSelectedModels([]);
      setFullAccess(true);
      fetchKeys();
      posthog.capture("onboarding_step_completed", {
        onboarding_step: "api_key_created",
      });
      setError(null);
    } else {
      setError(data.error || "Could not create API key");
    }
    setLoading(false);
  }

  async function revokeKey(id: string) {
    if (!confirm("Are you sure you want to revoke this key?")) return;
    const res = await fetch(`/api/keys/${id}`, { method: "DELETE", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not revoke API key");
      return;
    }
    fetchKeys();
  }

  function copyKey() {
    navigator.clipboard.writeText(newKeyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleModel(modelId: string) {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId]
    );
  }

  const atLimit = Boolean(quota?.atLimit);

  return (
    <div>
      <PageHeader
        eyebrow="Access"
        title="API Keys"
        description="Create OpenDoor keys for the gateway, then optionally paste your own provider keys so traffic uses your credentials."
      />

      <div className="mb-6 card p-5">
        <h2 className="section-title mb-2">How keys work</h2>
        <ul className="space-y-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          <li>
            Create an OpenDoor key on this page. The secret is shown once (prefix{" "}
            <code className="font-mono text-xs">opd_</code>). After that we only store a hash and
            prefix.
          </li>
          <li>
            Paste your OpenAI, Anthropic, or other provider secret in Bring your own key below, or
            on{" "}
            <Link href="/dashboard/settings/byok" className="underline">
              Settings → Provider keys
            </Link>
            . The gateway uses that row in{" "}
            <code className="font-mono text-xs">organization_provider_keys</code>.
          </li>
          <li>
            Docs:{" "}
            <Link href="/docs/how-it-works/api-keys" className="underline">
              API keys
            </Link>
            {" · "}
            <Link href="/docs/how-it-works/byok" className="underline">
              Bring your own keys
            </Link>
          </li>
        </ul>
      </div>

      {error ? (
        <div className="alert-error mb-4 text-sm" role="alert">
          {error}{" "}
          {atLimit ? (
            <Link href="/dashboard/pricing" className="underline">
              Upgrade
            </Link>
          ) : null}
        </div>
      ) : null}

      {newKeyValue && (
        <div className="mb-6 alert-success flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">New API key created</p>
            <p className="mt-1 font-mono text-sm break-all">{newKeyValue}</p>
            <p className="mt-1.5 text-xs" style={{ opacity: 0.9 }}>
              Copy this key now — you won&apos;t be able to see it again. It is also stored for this
              browser&apos;s playground.
            </p>
            <Link href="/dashboard/playground" className="mt-2 inline-block text-xs font-medium underline">
              Open playground with this key
            </Link>
          </div>
          <button
            onClick={copyKey}
            className="btn btn-sm shrink-0"
            style={{
              background: "color-mix(in srgb, var(--md-tertiary-container) 85%, white)",
              color: "var(--md-on-tertiary-container)",
              border: "1px solid color-mix(in srgb, var(--md-tertiary) 25%, transparent)",
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="section-title">Create new key</h2>
          {quota ? (
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              {quota.used} of {quota.max} keys on {quota.planName}
            </p>
          ) : null}
        </div>
        <form onSubmit={createKey} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Key Name
            </label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Production Key"
              className="input max-w-sm"
              maxLength={80}
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Model Access
            </label>
            <div className="flex items-center gap-5">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  checked={fullAccess}
                  onChange={() => setFullAccess(true)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className="flex items-center gap-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <ShieldCheck className="h-4 w-4" style={{ color: "var(--green)" }} />
                  Full Access
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  checked={!fullAccess}
                  onChange={() => setFullAccess(false)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className="flex items-center gap-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <Shield className="h-4 w-4" style={{ color: "var(--yellow)" }} />
                  Restricted
                </span>
              </label>
            </div>

            {!fullAccess && (
              <div className="mt-3 rounded-lg border p-4" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))" }}>
                <p className="mb-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Select which models this key can access:
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {catalog.length === 0 && (
                    <p className="col-span-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      No catalog models yet. Seed the database or ingest open models.
                    </p>
                  )}
                  {catalog.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(m.id)}
                        onChange={() => toggleModel(m.id)}
                        className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
                      />
                      <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {m.name}
                      </span>
                      <span className="ml-auto text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {m.provider}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || atLimit || (!fullAccess && selectedModels.length === 0)}
            className="btn-primary"
          >
            <Key className="h-4 w-4" />
            {loading ? "Creating…" : atLimit ? "Plan limit reached" : "Create Key"}
          </button>
        </form>
      </div>

      <div className="mt-6 card overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="table-header-cell">Name</th>
              <th className="table-header-cell">Prefix</th>
              <th className="table-header-cell">Access</th>
              <th className="table-header-cell">Created</th>
              <th className="table-header-cell">Last Used</th>
              <th className="table-header-cell text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Loading keys…
                </td>
              </tr>
            ) : null}
            {!listLoading &&
              keys.map((key) => (
                <tr key={key.id} className="table-row">
                  <td className="table-cell font-medium" style={{ color: "hsl(var(--foreground))" }}>
                    {key.name}
                  </td>
                  <td className="table-cell font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {key.keyPrefix}••••••••
                  </td>
                  <td className="table-cell">
                    {key.allowedModels && key.allowedModels.length > 0 ? (
                      <span className="badge-warning">
                        <Shield className="h-3 w-3" />
                        {key.allowedModels.length} models
                      </span>
                    ) : (
                      <span className="badge-success">
                        <ShieldCheck className="h-3 w-3" />
                        Full Access
                      </span>
                    )}
                  </td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                  </td>
                  <td className="table-cell text-right">
                    <button
                      type="button"
                      onClick={() => revokeKey(key.id)}
                      className="btn-danger btn-sm"
                      aria-label={`Revoke API key ${key.name}`}
                      title={`Revoke API key ${key.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            {!listLoading && keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                  No API keys yet. Create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <ByokPanel />
      </div>
    </div>
  );
}
