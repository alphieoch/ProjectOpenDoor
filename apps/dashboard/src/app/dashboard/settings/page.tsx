"use client";

import { useState, useEffect } from "react";
import { Shield, Save, Loader2, Check } from "lucide-react";

interface SsoSettings {
  id: string;
  name: string;
  slug: string;
  ssoEnabled: boolean | null;
  ssoDefaultRole: string | null;
  workosOrganizationId: string | null;
  workosConnectionId: string | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SsoSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/sso")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.org || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(false);

    const res = await fetch("/api/settings/sso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ssoEnabled: settings.ssoEnabled,
        ssoDefaultRole: settings.ssoDefaultRole,
        workosOrganizationId: settings.workosOrganizationId,
        workosConnectionId: settings.workosConnectionId,
      }),
    });

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
        Failed to load settings
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mt-1 text-gray-600">
        Manage your organization&apos;s authentication and access settings
      </p>

      <form onSubmit={saveSettings} className="mt-6 max-w-2xl space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Single Sign-On (SSO)
            </h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Allow your team members to sign in using your company&apos;s identity
            provider (Okta, Azure AD, Google Workspace, etc.) via WorkOS.
          </p>

          <div className="mt-4 space-y-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={settings.ssoEnabled || false}
                onChange={(e) =>
                  setSettings({ ...settings, ssoEnabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
              <span className="text-sm font-medium text-gray-700">
                Enable SSO for this organization
              </span>
            </label>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                WorkOS Organization ID
              </label>
              <input
                type="text"
                value={settings.workosOrganizationId || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    workosOrganizationId: e.target.value,
                  })
                }
                placeholder="org_xxxxxxxxxxxx"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Find this in your{" "}
                <a
                  href="https://dashboard.workos.com/organizations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  WorkOS Dashboard
                </a>
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                WorkOS Connection ID (optional)
              </label>
              <input
                type="text"
                value={settings.workosConnectionId || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    workosConnectionId: e.target.value,
                  })
                }
                placeholder="conn_xxxxxxxxxxxx"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Default Role for SSO Users
              </label>
              <select
                value={settings.ssoDefaultRole || "member"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ssoDefaultRole: e.target.value,
                  })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {settings.ssoEnabled && settings.workosOrganizationId && (
              <div className="rounded-md bg-blue-50 p-3">
                <p className="text-sm text-blue-800">
                  <strong>SSO Login URL:</strong>
                </p>
                <code className="mt-1 block break-all text-xs text-blue-700">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/login?sso=${settings.slug}`
                    : `/login?sso=${settings.slug}`}
                </code>
                <p className="mt-1 text-xs text-blue-600">
                  Share this link with your team to sign in via SSO.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
