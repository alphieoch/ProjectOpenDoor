"use client";

import { useState, useEffect } from "react";
import { Users, Mail, Loader2, Copy, Check, Shield, User } from "lucide-react";

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    const [teamRes, inviteRes] = await Promise.all([
      fetch("/api/team"),
      fetch("/api/invitations"),
    ]);
    if (teamRes.ok) setMembers((await teamRes.json()).members || []);
    if (inviteRes.ok) setInvitations((await inviteRes.json()).invitations || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function sendInvitation(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    if (res.ok) {
      setInviteEmail("");
      setInviteRole("member");
      fetchData();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to send invitation");
    }
    setInviting(false);
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Team</h1>
        <p className="page-desc">Manage your organization&apos;s members and send invitations</p>
      </div>

      {/* Invite form */}
      <div className="card p-6">
        <h2 className="section-title mb-4">Invite team member</h2>
        <form onSubmit={sendInvitation} className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="input flex-1"
            required
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="input w-auto"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={inviting} className="btn-primary shrink-0">
            <Mail className="h-4 w-4" />
            {inviting ? "Sending…" : "Invite"}
          </button>
        </form>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="mt-5 card overflow-hidden">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="section-title">Pending Invitations</h2>
          </div>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="table-header-cell">Email</th>
                <th className="table-header-cell">Role</th>
                <th className="table-header-cell">Expires</th>
                <th className="table-header-cell text-right">Link</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} className="table-row">
                  <td className="table-cell text-zinc-900">{inv.email}</td>
                  <td className="table-cell">
                    <span className="badge-neutral capitalize">{inv.role}</span>
                  </td>
                  <td className="table-cell text-zinc-500">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td className="table-cell text-right">
                    <button
                      onClick={() => copyInviteLink(inv.token)}
                      className="btn-ghost btn-sm"
                    >
                      {copiedToken === inv.token ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copiedToken === inv.token ? "Copied" : "Copy Link"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Members table */}
      <div className="mt-5 card overflow-hidden">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="section-title">Members</h2>
        </div>
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="table-header-cell">Name</th>
              <th className="table-header-cell">Email</th>
              <th className="table-header-cell">Role</th>
              <th className="table-header-cell">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-400" />
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center">
                  <Users className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
                  <p className="text-sm text-zinc-400">No team members yet.</p>
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-2 font-medium text-zinc-900">
                      <User className="h-4 w-4 text-zinc-400" />
                      {m.name || "—"}
                    </div>
                  </td>
                  <td className="table-cell text-zinc-600">{m.email}</td>
                  <td className="table-cell">
                    <span className={`capitalize ${m.role === "admin" ? "badge-info" : "badge-neutral"}`}>
                      {m.role === "admin" && <Shield className="h-3 w-3" />}
                      {m.role}
                    </span>
                  </td>
                  <td className="table-cell text-zinc-500">{new Date(m.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
