"use client";

import { useState, useEffect } from "react";
import { Users, Loader2 } from "lucide-react";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isSiteAdmin: boolean;
  orgName: string | null;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [usersList, setUsersList] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => { setUsersList(d.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = usersList.filter((u) =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">All Users</h1>
        <p className="page-desc">Every user across all organizations</p>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="input max-w-sm"
        />
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="table-header-cell">User</th>
              <th className="table-header-cell">Organization</th>
              <th className="table-header-cell">Role</th>
              <th className="table-header-cell">Admin</th>
              <th className="table-header-cell">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-400" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <Users className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
                  <p className="text-sm text-zinc-400">No users found.</p>
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="table-row">
                  <td className="table-cell">
                    <div>
                      <p className="font-medium text-zinc-900">{u.name || "—"}</p>
                      <p className="text-xs text-zinc-400">{u.email}</p>
                    </div>
                  </td>
                  <td className="table-cell text-zinc-600">{u.orgName || "—"}</td>
                  <td className="table-cell">
                    <span className={u.role === "admin" ? "badge-info" : "badge-neutral"}>{u.role}</span>
                  </td>
                  <td className="table-cell">
                    {u.isSiteAdmin ? (
                      <span className="badge-warning">Site Admin</span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="table-cell text-zinc-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
