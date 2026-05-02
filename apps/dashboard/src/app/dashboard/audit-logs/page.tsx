"use client";

import { useState, useEffect } from "react";
import { ClipboardList, Loader2 } from "lucide-react";

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

function getActionColor(action: string): string {
  if (action.includes("created") || action.includes("accepted")) {
    return "bg-green-100 text-green-800";
  }
  if (action.includes("revoked") || action.includes("disabled")) {
    return "bg-red-100 text-red-800";
  }
  if (action.includes("updated") || action.includes("configured")) {
    return "bg-blue-100 text-blue-800";
  }
  return "bg-gray-100 text-gray-800";
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
      <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
      <p className="mt-1 text-gray-600">
        Track all administrative actions across your organization
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Details
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                IP
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  <ClipboardList className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  No audit logs yet. Actions will appear here as they happen.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getActionColor(
                        log.action
                      )}`}
                    >
                      {formatAction(log.action)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                    {log.userName || log.userEmail || "System"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {log.entityType && (
                      <span className="text-xs text-gray-400">
                        {log.entityType}:{log.entityId?.slice(0, 8)}
                      </span>
                    )}
                    {log.metadata && (
                      <pre className="mt-1 max-w-xs overflow-hidden text-xs text-gray-500">
                        {JSON.stringify(log.metadata, null, 2).slice(0, 100)}
                      </pre>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">
                    {log.ipAddress || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
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
