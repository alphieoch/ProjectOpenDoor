"use client";

import { useState, useEffect } from "react";
import { Key, Copy, Trash2, Check, Shield, ShieldCheck } from "lucide-react";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  allowedModels: string[] | null;
}

const ALL_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "OpenAI" },
  { id: "gpt-4", name: "GPT-4", provider: "OpenAI" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "OpenAI" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", provider: "Anthropic" },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", provider: "Anthropic" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "Google" },
  { id: "command-r-plus", name: "Command R+", provider: "Cohere" },
  { id: "command-r", name: "Command R", provider: "Cohere" },
  { id: "mistral-large-latest", name: "Mistral Large", provider: "Mistral" },
  { id: "mistral-medium-latest", name: "Mistral Medium", provider: "Mistral" },
  { id: "mistral-small-latest", name: "Mistral Small", provider: "Mistral" },
  { id: "deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek" },
  { id: "deepseek-coder", name: "DeepSeek Coder", provider: "DeepSeek" },
  { id: "qwen-max", name: "Qwen Max", provider: "Qwen" },
  { id: "qwen-plus", name: "Qwen Plus", provider: "Qwen" },
  { id: "qwen-turbo", name: "Qwen Turbo", provider: "Qwen" },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullAccess, setFullAccess] = useState(true);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  async function fetchKeys() {
    const res = await fetch("/api/keys");
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys);
    }
  }

  useEffect(() => { fetchKeys(); }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const allowedModels = fullAccess ? null : selectedModels;
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName, allowedModels }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewKeyValue(data.key);
      setNewKeyName("");
      setSelectedModels([]);
      setFullAccess(true);
      fetchKeys();
    }
    setLoading(false);
  }

  async function revokeKey(id: string) {
    if (!confirm("Are you sure you want to revoke this key?")) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
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

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">API Keys</h1>
        <p className="page-desc">
          Manage API keys for the OpenDoor gateway. Each key can have full access or be restricted to specific models.
        </p>
      </div>

      {newKeyValue && (
        <div className="mb-6 alert-success flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-emerald-900">New API key created</p>
            <p className="mt-1 font-mono text-sm text-emerald-800">{newKeyValue}</p>
            <p className="mt-1.5 text-xs text-emerald-700">
              Copy this key now — you won&apos;t be able to see it again.
            </p>
          </div>
          <button onClick={copyKey} className="btn btn-sm bg-emerald-100 text-emerald-800 hover:bg-emerald-200 shrink-0">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <div className="card p-6">
        <h2 className="section-title mb-4">Create new key</h2>
        <form onSubmit={createKey} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">Key Name</label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Production Key"
              className="input max-w-sm"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700">Model Access</label>
            <div className="flex items-center gap-5">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  checked={fullAccess}
                  onChange={() => setFullAccess(true)}
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="flex items-center gap-1.5 text-sm text-zinc-700">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Full Access
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  checked={!fullAccess}
                  onChange={() => setFullAccess(false)}
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="flex items-center gap-1.5 text-sm text-zinc-700">
                  <Shield className="h-4 w-4 text-amber-500" />
                  Restricted
                </span>
              </label>
            </div>

            {!fullAccess && (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <p className="mb-3 text-xs text-zinc-500">Select which models this key can access:</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {ALL_MODELS.map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-100">
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(m.id)}
                        onChange={() => toggleModel(m.id)}
                        className="h-4 w-4 rounded accent-indigo-600"
                      />
                      <span className="text-sm text-zinc-700">{m.name}</span>
                      <span className="ml-auto text-xs text-zinc-400">{m.provider}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || (!fullAccess && selectedModels.length === 0)}
            className="btn-primary"
          >
            <Key className="h-4 w-4" />
            {loading ? "Creating…" : "Create Key"}
          </button>
        </form>
      </div>

      <div className="mt-6 card overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="table-header-cell">Name</th>
              <th className="table-header-cell">Key</th>
              <th className="table-header-cell">Access</th>
              <th className="table-header-cell">Created</th>
              <th className="table-header-cell">Last Used</th>
              <th className="table-header-cell text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id} className="table-row">
                <td className="table-cell font-medium text-zinc-900">{key.name}</td>
                <td className="table-cell font-mono text-zinc-500">{key.keyPrefix}••••••••</td>
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
                <td className="table-cell text-zinc-500">{new Date(key.createdAt).toLocaleDateString()}</td>
                <td className="table-cell text-zinc-500">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                </td>
                <td className="table-cell text-right">
                  <button onClick={() => revokeKey(key.id)} className="btn-danger btn-sm">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">
                  No API keys yet. Create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
