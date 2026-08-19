"use client";

import { useState, useEffect } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: any;
  ipAddress: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  "api_key.created": "API Key Created",
  "api_key.revoked": "API Key Revoked",
  "user.login": "User Login",
  "user.logout": "User Logout",
  "user.invited": "User Invited",
  "user.invitation_accepted": "Invitation Accepted",
  "sso.enabled": "SSO Enabled",
  "sso.disabled": "SSO Disabled",
  "sso.configured": "SSO Configured",
  "billing.checkout_started": "Checkout Started",
  "billing.subscription_updated": "Subscription Updated",
  "billing.portal_opened": "Billing Portal Opened",
  "organization.updated": "Organization Updated",
  "settings.updated": "Settings Updated",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] || action;
}

function getActionBadgeClass(action: string): string {
  if (action.includes("created") || action.includes("accepted")) return "badge-success";
  if (action.includes("revoked") || action.includes("disabled")) return "badge-error";
  if (action.includes("updated") || action.includes("configured")) return "badge-info";
  return "badge-neutral";
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      const res = await fetch("/api/audit-logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
      setLoading(false);
    }
    fetchLogs();
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Audit Logs"
        description="Track all administrative actions across your organization."
      />

      <div className="card overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="table-header-cell">Action</th>
              <th className="table-header-cell">User</th>
              <th className="table-header-cell">Details</th>
              <th className="table-header-cell">IP</th>
              <th className="table-header-cell">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <ClipboardList className="mx-auto mb-3 h-8 w-8" style={{ color: "hsl(var(--muted-foreground))" }} />
                  <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                    No audit logs yet. Actions will appear here as they happen.
                  </p>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="table-row">
                  <td className="table-cell">
                    <span className={getActionBadgeClass(log.action)}>
                      {formatAction(log.action)}
                    </span>
                  </td>
                  <td className="table-cell whitespace-nowrap" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {log.userName || log.userEmail || "System"}
                  </td>
                  <td className="table-cell" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {log.entityType && (
                      <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {log.entityType}:{log.entityId?.slice(0, 8)}
                      </span>
                    )}
                    {log.metadata && (
                      <pre className="mt-1 max-w-xs overflow-hidden text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {JSON.stringify(log.metadata, null, 2).slice(0, 100)}
                      </pre>
                    )}
                  </td>
                  <td className="table-cell text-xs whitespace-nowrap" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {log.ipAddress || "—"}
                  </td>
                  <td className="table-cell text-xs whitespace-nowrap" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
