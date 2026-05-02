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
  const [showModelSelector, setShowModelSelector] = useState(false);

  async function fetchKeys() {
    const res = await fetch("/api/keys");
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys);
    }
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const allowedModels = fullAccess ? null : selectedModels;
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newKeyName,
        allowedModels,
      }),
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
      prev.includes(modelId)
        ? prev.filter((m) => m !== modelId)
        : [...prev, modelId]
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
      <p className="mt-1 text-gray-600">
        Manage API keys for accessing the OpenDoor gateway. Each key can have
        full access or be restricted to specific models.
      </p>

      {newKeyValue && (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-800">
                New API key created
              </p>
              <p className="mt-1 font-mono text-sm text-green-700">
                {newKeyValue}
              </p>
            </div>
            <button
              onClick={copyKey}
              className="rounded-md bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-200"
            >
              {copied ? (
                <Check className="inline h-4 w-4" />
              ) : (
                <Copy className="inline h-4 w-4" />
              )}
              {copied ? " Copied" : " Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-green-600">
            Copy this key now — you won&apos;t be able to see it again.
          </p>
        </div>
      )}

      <form onSubmit={createKey} className="mt-6 max-w-2xl space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Key Name
          </label>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Production Key"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Model Access
          </label>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={fullAccess}
                onChange={() => {
                  setFullAccess(true);
                  setShowModelSelector(false);
                }}
                className="h-4 w-4 text-primary-600"
              />
              <span className="flex items-center gap-1 text-sm text-gray-700">
                <ShieldCheck className="h-4 w-4 text-green-500" />
                Full Access (all models)
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={!fullAccess}
                onChange={() => {
                  setFullAccess(false);
                  setShowModelSelector(true);
                }}
                className="h-4 w-4 text-primary-600"
              />
              <span className="flex items-center gap-1 text-sm text-gray-700">
                <Shield className="h-4 w-4 text-amber-500" />
                Restricted
              </span>
            </label>
          </div>

          {!fullAccess && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="mb-2 text-xs text-gray-500">
                Select which models this key can access:
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ALL_MODELS.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-100"
                  >
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(m.id)}
                      onChange={() => toggleModel(m.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    />
                    <span className="text-sm text-gray-700">{m.name}</span>
                    <span className="ml-auto text-xs text-gray-400">
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
          disabled={loading || (!fullAccess && selectedModels.length === 0)}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Key"}
        </button>
      </form>

      <div className="mt-8 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Key
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Access
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Last Used
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {keys.map((key) => (
              <tr key={key.id}>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                  {key.name}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-gray-500">
                  {key.keyPrefix}••••••••
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm">
                  {key.allowedModels && key.allowedModels.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <Shield className="h-3 w-3" />
                      {key.allowedModels.length} models
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      <ShieldCheck className="h-3 w-3" />
                      Full Access
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {new Date(key.createdAt).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {key.lastUsedAt
                    ? new Date(key.lastUsedAt).toLocaleDateString()
                    : "Never"}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                  <button
                    onClick={() => revokeKey(key.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-sm text-gray-500"
                >
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
