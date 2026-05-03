"use client";

import { useState, useEffect } from "react";
import { Shield, Save, Loader2, Check, Globe, Mail } from "lucide-react";

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
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!settings) {
    return <div className="alert-error">Failed to load settings</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Settings</h1>
        <p className="page-desc">Manage your organization&apos;s authentication and access settings</p>
      </div>

      <form onSubmit={saveSettings} className="max-w-2xl space-y-5">
        {/* SSO */}
        <div className="card p-6">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-zinc-500" />
            <h2 className="section-title">Single Sign-On (SSO)</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Allow your team to sign in via Okta, Azure AD, Google Workspace, etc. through WorkOS.
          </p>

          <div className="mt-5 space-y-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={settings.ssoEnabled || false}
                onChange={(e) => setSettings({ ...settings, ssoEnabled: e.target.checked })}
                className="h-4 w-4 rounded accent-indigo-600"
              />
              <span className="text-sm font-medium text-zinc-700">Enable SSO for this organization</span>
            </label>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">WorkOS Organization ID</label>
              <input
                type="text"
                value={settings.workosOrganizationId || ""}
                onChange={(e) => setSettings({ ...settings, workosOrganizationId: e.target.value })}
                placeholder="org_xxxxxxxxxxxx"
                className="input"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Find this in your{" "}
                <a href="https://dashboard.workos.com/organizations" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700">
                  WorkOS Dashboard
                </a>
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                WorkOS Connection ID <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={settings.workosConnectionId || ""}
                onChange={(e) => setSettings({ ...settings, workosConnectionId: e.target.value })}
                placeholder="conn_xxxxxxxxxxxx"
                className="input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Default Role for SSO Users</label>
              <select
                value={settings.ssoDefaultRole || "member"}
                onChange={(e) => setSettings({ ...settings, ssoDefaultRole: e.target.value })}
                className="input"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {settings.ssoEnabled && settings.workosOrganizationId && (
              <div className="alert-info">
                <p className="font-medium text-indigo-900">SSO Login URL</p>
                <code className="mt-1 block break-all text-xs text-indigo-700">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/login?sso=${settings.slug}`
                    : `/login?sso=${settings.slug}`}
                </code>
                <p className="mt-1 text-xs text-indigo-600">Share this link with your team to sign in via SSO.</p>
              </div>
            )}
          </div>
        </div>

        {/* Custom Domain */}
        <div className="card p-6">
          <div className="flex items-center gap-2.5">
            <Globe className="h-5 w-5 text-zinc-500" />
            <h2 className="section-title">Custom Domain</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Configure a custom domain for your OpenDoor dashboard and API gateway.
          </p>

          <div className="mt-5 alert-info">
            <p className="font-medium text-indigo-900">DNS Configuration</p>
            <p className="mt-1 text-sm text-indigo-700">Create these CNAME records with your DNS provider:</p>
            <div className="mt-3 space-y-2 font-mono text-xs text-indigo-800">
              <div className="rounded-lg bg-white/70 p-3">
                <strong>Dashboard:</strong>
                <br />
                CNAME app.yourdomain.com →{" "}
                {typeof window !== "undefined" ? window.location.host : "your-frontdoor.azurefd.net"}
              </div>
              <div className="rounded-lg bg-white/70 p-3">
                <strong>Gateway API:</strong>
                <br />
                CNAME api.yourdomain.com →{" "}
                {typeof window !== "undefined" ? window.location.host : "your-frontdoor.azurefd.net"}
              </div>
            </div>
            <p className="mt-2 text-xs text-indigo-600">
              Then add <code>AZURE_GATEWAY_DOMAIN</code> and <code>AZURE_DASHBOARD_DOMAIN</code> to your GitHub Actions secrets and redeploy.
            </p>
          </div>
        </div>

        {/* Email Notifications */}
        <div className="card p-6">
          <div className="flex items-center gap-2.5">
            <Mail className="h-5 w-5 text-zinc-500" />
            <h2 className="section-title">Email Notifications</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Invitation emails are sent via Azure Communication Services. Set these environment variables to enable delivery:
          </p>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-700">
              <strong>AZURE_COMMUNICATION_CONNECTION_STRING</strong>
              <p className="mt-1 font-sans text-zinc-500">Your Azure Communication Services connection string</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-700">
              <strong>EMAIL_SENDER_ADDRESS</strong>
              <p className="mt-1 font-sans text-zinc-500">Verified sender email (e.g. noreply@opendoor.ai)</p>
            </div>
          </div>
          <div className="mt-4 alert-warning text-xs">
            Email is currently in console-only mode. Set the Azure Communication Services connection string to enable real email delivery.
          </div>
        </div>

        <div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
