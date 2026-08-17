"use client";

import { useState, useEffect } from "react";
import {
  Users, Mail, Loader2, Copy, Check,
  Shield, User, MoreHorizontal, UserPlus, Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableFooter,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ── Types ── */
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

/* ── Page ── */
export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  /* Invite dialog */
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  /* Edit role dialog */
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState("member");
  const [saving, setSaving] = useState(false);

  /* Copy invite link */
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

  /* Select logic */
  const toggleSelect = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  const allSelected = members.length > 0 && selected.length === members.length;

  /* Invite */
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
      setInviteEmail(""); setInviteRole("member");
      setInviteOpen(false);
      fetchData();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to send invitation");
    }
    setInviting(false);
  }

  /* Edit role */
  function openEdit(member: TeamMember) {
    setEditMember(member);
    setEditRole(member.role);
  }

  async function saveRole() {
    if (!editMember) return;
    setSaving(true);
    await fetch(`/api/team/${editMember.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: editRole }),
    });
    setSaving(false);
    setEditMember(null);
    fetchData();
  }

  /* Copy invite link */
  function copyInviteLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/invite?token=${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description="Manage members and pending invitations for your organisation."
        actions={
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <button className="btn-primary shrink-0">
              <UserPlus className="h-4 w-4" /> Invite member
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
            </DialogHeader>
            <form onSubmit={sendInvitation} className="flex flex-col gap-4 py-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--ink)" }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--ink)" }}>
                  Role
                </label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setInviteOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={inviting} className="btn-primary">
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {inviting ? "Sending…" : "Send invite"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        }
      />

      {/* Members table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2 className="section-title">
            Members
            {!loading && (
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--ink-3)" }}>
                {members.length}
              </span>
            )}
          </h2>
          {selected.length > 0 && (
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              {selected.length} selected
            </span>
          )}
        </div>

        <div className="max-h-[480px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelected(checked ? members.map((m) => m.id) : [])
                    }
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "var(--ink-3)" }} />
                  </TableCell>
                </TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center">
                    <Users className="mx-auto mb-3 h-8 w-8" style={{ color: "var(--line)" }} />
                    <p className="text-sm" style={{ color: "var(--ink-3)" }}>No members yet. Invite someone to get started.</p>
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => (
                  <TableRow key={m.id} className="hover:bg-muted/40">
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(m.id)}
                        onCheckedChange={() => toggleSelect(m.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold"
                          style={{ background: "var(--brand)", color: "white" }}
                        >
                          {(m.name || m.email).charAt(0).toUpperCase()}
                        </div>
                        <span style={{ color: "var(--ink)" }}>{m.name || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell style={{ color: "var(--ink-2)" }}>{m.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={m.role === "admin" ? "default" : "secondary"}
                        className="gap-1 capitalize"
                      >
                        {m.role === "admin" && <Shield className="h-3 w-3" />}
                        {m.role}
                      </Badge>
                    </TableCell>
                    <TableCell style={{ color: "var(--ink-3)" }}>
                      {new Date(m.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(m)}>
                            <User className="h-4 w-4" /> Change role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4" /> Remove member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>

            {members.length > 0 && (
              <TableFooter className="sticky bottom-0">
                <TableRow>
                  <TableCell colSpan={6}>
                    {selected.length > 0 ? `${selected.length} of ${members.length} selected` : `${members.length} member${members.length !== 1 ? "s" : ""}`}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="mt-5 card overflow-hidden">
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
            <h2 className="section-title">
              Pending Invitations
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--ink-3)" }}>
                {invitations.length}
              </span>
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Invite link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell style={{ color: "var(--ink)" }}>{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{inv.role}</Badge>
                  </TableCell>
                  <TableCell style={{ color: "var(--ink-3)" }}>
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => copyInviteLink(inv.token)}
                      className="btn-ghost btn-sm"
                    >
                      {copiedToken === inv.token
                        ? <><Check className="h-3.5 w-3.5" /> Copied</>
                        : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit role dialog */}
      <Dialog open={!!editMember} onOpenChange={() => setEditMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
              Updating role for <strong style={{ color: "var(--ink)" }}>{editMember?.email}</strong>
            </p>
            <Select value={editRole} onValueChange={setEditRole}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <button className="btn-ghost btn-sm" onClick={() => setEditMember(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveRole} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
