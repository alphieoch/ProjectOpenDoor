"use client";

import { useState, useEffect } from "react";
import { Key, Copy, Trash2, Check } from "lucide-react";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

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
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewKeyValue(data.key);
      setNewKeyName("");
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
      <p className="mt-1 text-gray-600">
        Manage API keys for accessing the OpenDoor gateway
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

      <form
        onSubmit={createKey}
        className="mt-6 flex max-w-md items-end gap-3"
      >
        <div className="flex-1">
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
        <button
          type="submit"
          disabled={loading}
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
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 font-mono">
                  {key.keyPrefix}••••••••
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
                  colSpan={5}
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
