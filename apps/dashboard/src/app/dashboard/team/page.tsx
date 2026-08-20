"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building,
  Check,
  Cloud,
  Home,
  Loader2,
  Mail,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { formatUsdCents } from "@/lib/usage-format";

interface FamilyMember {
  id: string;
  name: string;
  email: string;
  role: "organizer" | "member";
  isExtraSeat?: boolean;
  joinedAt: string;
  monthlyQuotaCents: number | null;
  currentMonthSpentCents: number;
}

interface FamilyData {
  isFamilyPlan: boolean;
  planId: string;
  planName: string;
  baseSeats: number;
  extraSeatsCount: number;
  totalAllowedSeats: number;
  seatsUsed: number;
  totalPoolCreditsCents: number;
  rolledOverCreditsCents: number;
  rolloverMaxMonths: number;
  members: FamilyMember[];
}

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

interface GcpStatus {
  enabled: boolean;
  projectId: string | null;
  workspaceDomain: string | null;
  status: string;
  lastSync: string | null;
  account: string | null;
  region: string | null;
  authenticated: boolean;
}

const emptyFamily: FamilyData = {
  isFamilyPlan: false,
  planId: "free",
  planName: "",
  baseSeats: 1,
  extraSeatsCount: 0,
  totalAllowedSeats: 1,
  seatsUsed: 0,
  totalPoolCreditsCents: 0,
  rolledOverCreditsCents: 0,
  rolloverMaxMonths: 0,
  members: [],
};

export default function TeamPage() {
  const [viewMode, setViewMode] = useState<"family" | "team">("team");
  const [familyData, setFamilyData] = useState<FamilyData>(emptyFamily);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [gcp, setGcp] = useState<GcpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteQuotaUsd, setInviteQuotaUsd] = useState("50");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function fetchAllData() {
    setLoading(true);
    setError(null);
    try {
      const [familyRes, teamRes, invRes, gcpRes] = await Promise.all([
        fetch("/api/settings/family", { credentials: "include" }),
        fetch("/api/team", { credentials: "include" }),
        fetch("/api/invitations", { credentials: "include" }),
        fetch("/api/team/google-mcp", { credentials: "include" }),
      ]);
      const [familyJson, teamJson, invJson, gcpJson] = await Promise.all([
        familyRes.json().catch(() => ({})),
        teamRes.json().catch(() => ({})),
        invRes.json().catch(() => ({})),
        gcpRes.json().catch(() => ({})),
      ]);

      if (!familyRes.ok && !teamRes.ok) {
        setError(familyJson.error || teamJson.error || "Failed to load team.");
      }
      if (familyJson.family) {
        setFamilyData(familyJson.family);
        if (familyJson.family.isFamilyPlan) setViewMode("family");
      }
      if (teamJson.members) setTeamMembers(teamJson.members);
      if (invJson.invitations) setInvitations(invJson.invitations);
      if (gcpJson.googleMcp) setGcp(gcpJson.googleMcp);
    } catch {
      setError("Failed to load team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchAllData();
  }, []);

  async function sendMemberInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res =
        viewMode === "family"
          ? await fetch("/api/settings/family", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "invite",
                email: inviteEmail,
                name: inviteName,
                monthlyQuotaCents: parseInt(inviteQuotaUsd, 10) * 100,
              }),
            })
          : await fetch("/api/invitations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError(data.error || "Failed to send invite.");
        return;
      }
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteName("");
      await fetchAllData();
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveFamilyMember(memberId: string) {
    const res = await fetch("/api/settings/family", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", memberId }),
    });
    if (res.ok) await fetchAllData();
  }

  async function syncGcp() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/team/google-mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_iam" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not read the GCP project.");
        return;
      }
      await fetchAllData();
    } finally {
      setSyncing(false);
    }
  }

  function copyInviteLink(token: string) {
    void navigator.clipboard.writeText(`${window.location.origin}/invite?token=${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const occupied = familyData.members.length;
  const capacity = familyData.totalAllowedSeats || familyData.baseSeats || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Team"
        description="Workspace members, invites, and the GCP project this org is linked to."
        actions={
          <button type="button" onClick={() => setShowInviteModal(true)} className="btn-primary inline-flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Invite
          </button>
        }
      />

      <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
        <button
          type="button"
          onClick={() => setViewMode("family")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
            viewMode === "family" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          <Home className="h-3.5 w-3.5" />
          Household
        </button>
        <button
          type="button"
          onClick={() => setViewMode("team")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
            viewMode === "team" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          <Building className="h-3.5 w-3.5" />
          Organization
        </button>
      </div>

      {error && (
        <div className="alert-error">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === "family" ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shared credit pool</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{formatUsdCents(familyData.totalPoolCreditsCents)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {familyData.planName || "Current plan"}
                {familyData.rolledOverCreditsCents > 0
                  ? ` · ${formatUsdCents(familyData.rolledOverCreditsCents)} remaining from earlier stipend grants`
                  : familyData.rolloverMaxMonths
                    ? ` · unused stipend can roll for ${familyData.rolloverMaxMonths} months`
                    : ""}
              </p>
              <Link href="/dashboard/billing" className="btn-secondary mt-4 inline-flex">
                Manage billing
              </Link>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Seats</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                {occupied} / {capacity}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {familyData.baseSeats} included on this plan.
                {occupied >= capacity ? " Upgrade on Billing to add seats." : " Invite someone into an open seat."}
              </p>
              {occupied >= capacity ? (
                <Link href="/dashboard/billing" className="btn-secondary mt-4 inline-flex">
                  Upgrade seats
                </Link>
              ) : (
                <button type="button" className="btn-secondary mt-4" onClick={() => setShowInviteModal(true)}>
                  Invite member
                </button>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="section-title mb-4 inline-flex items-center gap-2">
              <Users className="h-4 w-4" />
              Household members
            </h2>
            {familyData.members.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-foreground">No household members yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Invite a family member to share this credit pool.</p>
                <button type="button" className="btn-secondary mt-4" onClick={() => setShowInviteModal(true)}>
                  Invite member
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {familyData.members.map((member) => (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-xs text-muted-foreground">This month</p>
                        <p className="text-sm tabular-nums">{formatUsdCents(member.currentMonthSpentCents)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {member.monthlyQuotaCents
                            ? `${formatUsdCents(member.monthlyQuotaCents)} cap`
                            : "Uncapped"}
                        </p>
                      </div>
                      {member.role !== "organizer" && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveFamilyMember(member.id)}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
                          aria-label={`Remove ${member.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="section-title mb-4 inline-flex items-center gap-2">
              <Building className="h-4 w-4" />
              Organization members
            </h2>
            {teamMembers.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-foreground">No members yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Invite a colleague to this workspace.</p>
                <button type="button" className="btn-secondary mt-4" onClick={() => setShowInviteModal(true)}>
                  Invite colleague
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {teamMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.name || m.email.split("@")[0]}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    <span className="rounded-md border border-border px-2 py-1 text-xs uppercase text-muted-foreground">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="section-title mb-3">Pending invitations</h3>
            {invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invites.</p>
            ) : (
              <div className="divide-y divide-border">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="text-foreground">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">Role: {inv.role}</p>
                    </div>
                    <button type="button" className="btn-secondary text-xs" onClick={() => copyInviteLink(inv.token)}>
                      {copiedToken === inv.token ? <Check className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                      {copiedToken === inv.token ? "Copied" : "Copy link"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="section-title">Google Cloud project</h2>
              <p className="text-sm text-muted-foreground">
                {gcp?.enabled
                  ? "Signed-in gcloud project for this machine / workspace."
                  : "Not linked. Set GOOGLE_CLOUD_PROJECT or sign in with gcloud."}
              </p>
            </div>
          </div>
          <button type="button" className="btn-secondary" disabled={syncing} onClick={() => void syncGcp()}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {syncing ? "Reading gcloud…" : "Refresh from gcloud"}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Project</p>
            <p className="mt-1 font-medium">{gcp?.projectId || "—"}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Account</p>
            <p className="mt-1 font-medium">{gcp?.account || "Not signed in"}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Region</p>
            <p className="mt-1 font-medium">{gcp?.region || "—"}</p>
          </div>
        </div>
        {gcp?.lastSync ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Last saved {new Date(gcp.lastSync).toLocaleString()}
          </p>
        ) : null}
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-background/80"
            aria-label="Close invite"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">
              {viewMode === "family" ? "Invite household member" : "Invite colleague"}
            </h3>
            {inviteError && <p className="mt-3 text-sm text-destructive">{inviteError}</p>}
            <form onSubmit={sendMemberInvite} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input w-full"
                />
              </div>
              {viewMode === "family" ? (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Monthly cap (USD)</label>
                  <input
                    type="number"
                    min="1"
                    value={inviteQuotaUsd}
                    onChange={(e) => setInviteQuotaUsd(e.target.value)}
                    className="input w-28"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Role</label>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input w-full">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setShowInviteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={inviting}>
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Send invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
