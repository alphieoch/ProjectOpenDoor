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
  orgName: string | null;
}

function getActionBadgeClass(action: string): string {
  if (action.includes("created") || action.includes("accepted")) return "badge-success";
  if (action.includes("revoked") || action.includes("disabled")) return "badge-error";
  if (action.includes("updated") || action.includes("configured")) return "badge-info";
  return "badge-neutral";
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgFilter, setOrgFilter] = useState("");

  useEffect(() => {
    const url = orgFilter ? `/api/admin/audit-logs?orgId=${orgFilter}` : "/api/admin/audit-logs";
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setLogs(d.logs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [orgFilter]);

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-desc">Cross-organization audit log</p>
        </div>
        <input
          type="text"
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          placeholder="Filter by org ID…"
          className="input w-auto max-w-xs"
        />
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="table-header-cell">Action</th>
              <th className="table-header-cell">Organization</th>
              <th className="table-header-cell">User</th>
              <th className="table-header-cell">Details</th>
              <th className="table-header-cell">IP</th>
              <th className="table-header-cell">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-400" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <ClipboardList className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
                  <p className="text-sm text-zinc-400">No audit logs found.</p>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="table-row">
                  <td className="table-cell">
                    <span className={getActionBadgeClass(log.action)}>{log.action}</span>
                  </td>
                  <td className="table-cell text-zinc-600 whitespace-nowrap">{log.orgName || "—"}</td>
                  <td className="table-cell text-zinc-700 whitespace-nowrap">
                    {log.userName || log.userEmail || "System"}
                  </td>
                  <td className="table-cell text-zinc-400 text-xs">
                    {log.entityType && `${log.entityType}:${log.entityId?.slice(0, 8)}`}
                  </td>
                  <td className="table-cell text-xs text-zinc-400 whitespace-nowrap">{log.ipAddress || "—"}</td>
                  <td className="table-cell text-xs text-zinc-500 whitespace-nowrap">
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
