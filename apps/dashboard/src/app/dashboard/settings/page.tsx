"use client";

import { useState, useEffect } from "react";
import {
  Shield, Save, Loader2, Check, Globe, Mail, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";

/* ── Types ── */
interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  ssoEnabled: boolean | null;
  ssoDefaultRole: string | null;
  workosOrganizationId: string | null;
  workosConnectionId: string | null;
  customDomain: string | null;
  customDomainVerified: boolean | null;
  emailNotificationsEnabled: boolean | null;
  notifyOnInvites: boolean | null;
  notifyOnBillingAlerts: boolean | null;
}

/* ── Tab config ── */
const TABS = [
  { id: "sso",    label: "Authentication", icon: Shield },
  { id: "domain", label: "Custom Domain",  icon: Globe  },
  { id: "email",  label: "Notifications",  icon: Mail   },
] as const;

type Tab = typeof TABS[number]["id"];

/* ── Row helper ── */
function SettingRow({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:gap-8">
      <div className="w-full shrink-0 sm:w-48">
        <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/* ── Page ── */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("sso");
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/sso")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setSettings(data.org || null);
        }
        setLoading(false);
      })
      .catch(() => { setLoading(false); setError("Failed to load settings."); });
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true); setSaved(false); setError(null);
    const res = await fetch("/api/settings/sso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ssoEnabled: settings.ssoEnabled,
        ssoDefaultRole: settings.ssoDefaultRole,
        workosOrganizationId: settings.workosOrganizationId,
        workosConnectionId: settings.workosConnectionId,
        customDomain: settings.customDomain,
        customDomainVerified: settings.customDomainVerified,
        emailNotificationsEnabled: settings.emailNotificationsEnabled,
        notifyOnInvites: settings.notifyOnInvites,
        notifyOnBillingAlerts: settings.notifyOnBillingAlerts,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError(data.error || "Failed to save settings.");
    }
    setSaving(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage your organisation's configuration and integrations."
      />

      <div className="flex gap-8">
        {/* ── Left tab nav ── */}
        <nav className="w-44 shrink-0">
          <ul className="flex flex-col gap-0.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    activeTab === id
                      ? "bg-[var(--paper-3)] text-[var(--ink)]"
                      : "text-[var(--ink-2)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" style={{ color: activeTab === id ? "var(--brand)" : "var(--ink-3)" }} />
                  {label}
                  {activeTab === id && (
                    <ChevronRight className="ml-auto h-3.5 w-3.5" style={{ color: "var(--ink-4)" }} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Right content panel ── */}
        <div className="flex-1 min-w-0">

          {/* Loading */}
          {loading && (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
            </div>
          )}

          {!loading && !settings && (
            <div className="alert-error">{error || "Failed to load settings."}</div>
          )}

          {!loading && settings && (
            <form onSubmit={saveSettings}>
              {/* ── Authentication / SSO ── */}
              {activeTab === "sso" && (
                <div className="card">
                  <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                    <div className="flex items-center gap-2.5">
                      <Shield className="h-4 w-4" style={{ color: "var(--brand)" }} />
                      <h2 className="section-title">Single Sign-On</h2>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                      Allow your team to authenticate via Okta, Azure AD, Google Workspace, and more through WorkOS.
                    </p>
                  </div>

                  <div className="divide-y px-6" style={{ borderColor: "var(--line)" }}>
                    <SettingRow label="Enable SSO" hint="Team members will be redirected to your identity provider.">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.ssoEnabled || false}
                          onChange={(e) => setSettings({ ...settings, ssoEnabled: e.target.checked })}
                          className="h-4 w-4 rounded accent-indigo-600"
                        />
                        <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                          {settings.ssoEnabled ? "SSO is enabled" : "SSO is disabled"}
                        </span>
                      </label>
                    </SettingRow>

                    <SettingRow label="WorkOS Organisation ID" hint="Found in your WorkOS Dashboard under Organisations.">
                      <input
                        type="text"
                        value={settings.workosOrganizationId || ""}
                        onChange={(e) => setSettings({ ...settings, workosOrganizationId: e.target.value })}
                        placeholder="org_xxxxxxxxxxxx"
                        className="input w-full"
                      />
                      <a
                        href="https://dashboard.workos.com/organizations"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-block text-xs"
                        style={{ color: "var(--brand)" }}
                      >
                        Open WorkOS Dashboard ↗
                      </a>
                    </SettingRow>

                    <SettingRow
                      label="WorkOS Connection ID"
                      hint="Optional. Locks authentication to a specific connection."
                    >
                      <input
                        type="text"
                        value={settings.workosConnectionId || ""}
                        onChange={(e) => setSettings({ ...settings, workosConnectionId: e.target.value })}
                        placeholder="conn_xxxxxxxxxxxx"
                        className="input w-full"
                      />
                    </SettingRow>

                    <SettingRow label="Default role" hint="Role assigned to new users who sign in via SSO.">
                      <select
                        value={settings.ssoDefaultRole || "member"}
                        onChange={(e) => setSettings({ ...settings, ssoDefaultRole: e.target.value })}
                        className="input"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </SettingRow>

                    {settings.ssoEnabled && settings.workosOrganizationId && (
                      <div className="py-5">
                        <div className="alert-info">
                          <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>SSO login URL</p>
                          <code className="mt-1.5 block break-all text-xs" style={{ color: "var(--brand)" }}>
                            {typeof window !== "undefined"
                              ? `${window.location.origin}/login?sso=${settings.slug}`
                              : `/login?sso=${settings.slug}`}
                          </code>
                          <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                            Share this link with your team so they can sign in with SSO.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Custom Domain ── */}
              {activeTab === "domain" && (
                <div className="card">
                  <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                    <div className="flex items-center gap-2.5">
                      <Globe className="h-4 w-4" style={{ color: "var(--brand)" }} />
                      <h2 className="section-title">Custom Domain</h2>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                      Configure a custom domain for your OpenDoor dashboard and API gateway.
                    </p>
                  </div>

                  <div className="divide-y px-6" style={{ borderColor: "var(--line)" }}>
                    <SettingRow label="Dashboard domain" hint="The custom domain you want to use for the dashboard.">
                      <input
                        type="text"
                        value={settings.customDomain || ""}
                        onChange={(e) => setSettings({ ...settings, customDomain: e.target.value, customDomainVerified: false })}
                        placeholder="app.yourdomain.com"
                        className="input w-full"
                      />
                    </SettingRow>

                    {settings.customDomain && (
                      <>
                        <SettingRow label="DNS CNAME" hint="Point your dashboard subdomain here.">
                          <div className="rounded-lg border p-3 font-mono text-xs" style={{ borderColor: "var(--line)", background: "var(--paper-3)", color: "var(--ink-2)" }}>
                            <p className="mb-1 font-sans text-xs font-medium" style={{ color: "var(--ink-3)" }}>CNAME record</p>
                            <p>{settings.customDomain}</p>
                            <p className="mt-0.5" style={{ color: "var(--ink-4)" }}>→ {typeof window !== "undefined" ? window.location.host : "your-frontdoor.azurefd.net"}</p>
                          </div>
                        </SettingRow>

                        <SettingRow label="Verification" hint="After adding DNS records, mark as verified.">
                          <label className="flex cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={settings.customDomainVerified || false}
                              onChange={(e) => setSettings({ ...settings, customDomainVerified: e.target.checked })}
                              className="h-4 w-4 rounded accent-indigo-600"
                            />
                            <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                              {settings.customDomainVerified ? "Domain verified" : "Domain not verified"}
                            </span>
                          </label>
                        </SettingRow>
                      </>
                    )}

                    <SettingRow label="Gateway API CNAME" hint="Point your API subdomain here.">
                      <div className="rounded-lg border p-3 font-mono text-xs" style={{ borderColor: "var(--line)", background: "var(--paper-3)", color: "var(--ink-2)" }}>
                        <p className="mb-1 font-sans text-xs font-medium" style={{ color: "var(--ink-3)" }}>CNAME record</p>
                        <p>api.yourdomain.com</p>
                        <p className="mt-0.5" style={{ color: "var(--ink-4)" }}>→ {typeof window !== "undefined" ? window.location.host : "your-frontdoor.azurefd.net"}</p>
                      </div>
                    </SettingRow>

                    <SettingRow label="Activate" hint="After adding DNS records, set these in GitHub Actions secrets and redeploy.">
                      <div className="space-y-2">
                        {["AZURE_GATEWAY_DOMAIN", "AZURE_DASHBOARD_DOMAIN"].map((v) => (
                          <div key={v} className="rounded-lg border px-3 py-2 font-mono text-xs" style={{ borderColor: "var(--line)", background: "var(--paper-3)", color: "var(--ink-2)" }}>
                            {v}
                          </div>
                        ))}
                      </div>
                    </SettingRow>
                  </div>
                </div>
              )}

              {/* ── Email Notifications ── */}
              {activeTab === "email" && (
                <div className="card">
                  <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                    <div className="flex items-center gap-2.5">
                      <Mail className="h-4 w-4" style={{ color: "var(--brand)" }} />
                      <h2 className="section-title">Email Notifications</h2>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                      Control which emails your organisation receives.
                    </p>
                  </div>

                  <div className="divide-y px-6" style={{ borderColor: "var(--line)" }}>
                    <SettingRow label="Master switch" hint="Toggle all email notifications on or off.">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.emailNotificationsEnabled || false}
                          onChange={(e) => setSettings({ ...settings, emailNotificationsEnabled: e.target.checked })}
                          className="h-4 w-4 rounded accent-indigo-600"
                        />
                        <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                          {settings.emailNotificationsEnabled ? "Email notifications enabled" : "Email notifications disabled"}
                        </span>
                      </label>
                    </SettingRow>

                    <SettingRow label="Team invites" hint="Receive an email when someone is invited to your organisation.">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.notifyOnInvites || false}
                          onChange={(e) => setSettings({ ...settings, notifyOnInvites: e.target.checked })}
                          disabled={!settings.emailNotificationsEnabled}
                          className="h-4 w-4 rounded accent-indigo-600 disabled:opacity-40"
                        />
                        <span className="text-sm" style={{ color: settings.emailNotificationsEnabled ? "var(--ink-2)" : "var(--ink-4)" }}>
                          {settings.notifyOnInvites ? "On" : "Off"}
                        </span>
                      </label>
                    </SettingRow>

                    <SettingRow label="Billing alerts" hint="Receive an email when your balance is low or a charge fails.">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.notifyOnBillingAlerts || false}
                          onChange={(e) => setSettings({ ...settings, notifyOnBillingAlerts: e.target.checked })}
                          disabled={!settings.emailNotificationsEnabled}
                          className="h-4 w-4 rounded accent-indigo-600 disabled:opacity-40"
                        />
                        <span className="text-sm" style={{ color: settings.emailNotificationsEnabled ? "var(--ink-2)" : "var(--ink-4)" }}>
                          {settings.notifyOnBillingAlerts ? "On" : "Off"}
                        </span>
                      </label>
                    </SettingRow>

                    <SettingRow label="Required variables" hint="Add these to your deployment environment to enable real email delivery.">
                      <div className="space-y-3">
                        <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "var(--paper-3)" }}>
                          <p className="font-mono text-xs font-semibold" style={{ color: "var(--ink)" }}>AZURE_COMMUNICATION_CONNECTION_STRING</p>
                          <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>Your Azure Communication Services connection string</p>
                        </div>
                        <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "var(--paper-3)" }}>
                          <p className="font-mono text-xs font-semibold" style={{ color: "var(--ink)" }}>EMAIL_SENDER_ADDRESS</p>
                          <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>Verified sender email, e.g. noreply@opendoor.ai</p>
                        </div>
                      </div>
                    </SettingRow>
                  </div>
                </div>
              )}

              {/* Error / Save footer */}
              {error && (
                <div className="mt-4 alert-error text-sm">{error}</div>
              )}
              <div className="mt-4 flex items-center gap-3">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" />
                    : saved  ? <Check className="h-4 w-4" />
                    : <Save className="h-4 w-4" />}
                  {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
                </button>
                {saved && (
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>Changes saved successfully.</span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
