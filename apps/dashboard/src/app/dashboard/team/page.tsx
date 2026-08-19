"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Mail,
  Loader2,
  Check,
  UserPlus,
  Trash2,
  Sparkles,
  Plus,
  Minus,
  Clock,
  Lock,
  ArrowUpRight,
  Building,
  Home,
  Cloud,
  Layers,
  RefreshCw,
  Cpu,
  FolderSync,
  Database,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/* ── Types ── */
interface FamilyMember {
  id: string;
  name: string;
  email: string;
  role: "organizer" | "member";
  isExtraSeat?: boolean;
  avatarUrl?: string | null;
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
  maxExtraSeats: number;
  extraSeatPriceGbp: number;
  extraSeatPriceUsd: number;
  totalAllowedSeats: number;
  seatsUsed: number;
  totalPoolCreditsCents: number;
  rolledOverCreditsCents: number;
  rolloverMonthsActive: number;
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

interface GoogleMcpTool {
  id: string;
  name: string;
  category: "cloud" | "workspace" | "vertex" | "storage";
  description: string;
  status: "connected" | "active" | "available";
  command: string;
  capabilities: string[];
}

interface GoogleMcpData {
  enabled: boolean;
  projectId: string;
  workspaceDomain: string;
  serviceAccount: string;
  status: string;
  lastSync: string;
  tools: GoogleMcpTool[];
}

export default function TeamPage() {
  const [viewMode, setViewMode] = useState<"family" | "team">("family");
  const [familyData, setFamilyData] = useState<FamilyData>({
    isFamilyPlan: true,
    planId: "family",
    planName: "Family Plan (4 Seats)",
    baseSeats: 4,
    extraSeatsCount: 0,
    maxExtraSeats: 5,
    extraSeatPriceGbp: 4.99,
    extraSeatPriceUsd: 6.50,
    totalAllowedSeats: 4,
    seatsUsed: 1,
    totalPoolCreditsCents: 25000,
    rolledOverCreditsCents: 11500,
    rolloverMonthsActive: 3,
    rolloverMaxMonths: 4,
    members: [],
  });

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [googleMcp, setGoogleMcp] = useState<GoogleMcpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingMcp, setSyncingMcp] = useState(false);
  const [mcpSyncedSuccess, setMcpSyncedSuccess] = useState(false);

  // Extra seat purchasing state
  const [seatUpdating, setSeatUpdating] = useState(false);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteQuotaUsd, setInviteQuotaUsd] = useState("50");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Copy link
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function fetchAllData() {
    setLoading(true);
    try {
      const [familyRes, teamRes, invRes, mcpRes] = await Promise.all([
        fetch("/api/settings/family").then((r) => r.json()).catch(() => ({})),
        fetch("/api/team").then((r) => r.json()).catch(() => ({})),
        fetch("/api/invitations").then((r) => r.json()).catch(() => ({})),
        fetch("/api/team/google-mcp").then((r) => r.json()).catch(() => ({})),
      ]);

      if (familyRes.family) {
        setFamilyData(familyRes.family);
      }
      if (teamRes.members) {
        setTeamMembers(teamRes.members);
      }
      if (invRes.invitations) {
        setInvitations(invRes.invitations);
      }
      if (mcpRes.googleMcp) {
        setGoogleMcp(mcpRes.googleMcp);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAllData();
  }, []);

  async function handleAddExtraSeat() {
    if (familyData.extraSeatsCount >= familyData.maxExtraSeats) return;
    setSeatUpdating(true);
    try {
      const res = await fetch("/api/settings/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_extra_seat" }),
      });
      const data = await res.json();
      if (data.success) {
        setFamilyData((prev) => ({
          ...prev,
          extraSeatsCount: data.extraSeatsCount,
          totalAllowedSeats: data.totalAllowedSeats,
        }));
      }
    } finally {
      setSeatUpdating(false);
    }
  }

  async function handleRemoveExtraSeat() {
    if (familyData.extraSeatsCount <= 0) return;
    setSeatUpdating(true);
    try {
      const res = await fetch("/api/settings/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_extra_seat" }),
      });
      const data = await res.json();
      if (data.success) {
        setFamilyData((prev) => ({
          ...prev,
          extraSeatsCount: data.extraSeatsCount,
          totalAllowedSeats: data.totalAllowedSeats,
        }));
      }
    } finally {
      setSeatUpdating(false);
    }
  }

  async function triggerGoogleMcpSync() {
    setSyncingMcp(true);
    setMcpSyncedSuccess(false);
    try {
      const res = await fetch("/api/team/google-mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_iam" }),
      });
      if (res.ok) {
        setMcpSyncedSuccess(true);
        setTimeout(() => setMcpSyncedSuccess(false), 3000);
        fetchAllData();
      }
    } finally {
      setSyncingMcp(false);
    }
  }

  async function sendMemberInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    setInviteError(null);

    try {
      if (viewMode === "family") {
        const res = await fetch("/api/settings/family", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "invite",
            email: inviteEmail,
            name: inviteName,
            monthlyQuotaCents: parseInt(inviteQuotaUsd, 10) * 100,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setShowInviteModal(false);
          setInviteEmail("");
          setInviteName("");
          fetchAllData();
        } else {
          setInviteError(data.error || "Failed to invite member");
        }
      } else {
        const res = await fetch("/api/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
        });
        const data = await res.json();
        if (res.ok) {
          setInviteEmail("");
          setInviteRole("member");
          setShowInviteModal(false);
          fetchAllData();
        } else {
          setInviteError(data.error || "Failed to send team invitation");
        }
      }
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveFamilyMember(memberId: string) {
    try {
      const res = await fetch("/api/settings/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", memberId }),
      });
      const data = await res.json();
      if (data.success) {
        fetchAllData();
      }
    } catch {
      // ignore
    }
  }

  function copyInviteLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/invite?token=${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const totalOccupiedSeats = familyData.members.length;
  const totalCapacity = familyData.totalAllowedSeats;

  return (
    <div className="space-y-6">
      {/* ── Top Header with Perspective Switcher ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace Collaboration
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary border border-primary/20">
              {viewMode === "family" ? "HOUSEHOLD SHARING" : "ENTERPRISE TEAM"}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {viewMode === "family" ? "Family & Household Sharing" : "Team & Organization Members"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {viewMode === "family"
              ? "Share your credit pool with household members, add extra seats for £4.99/month, and set per-member monthly caps."
              : "Manage organization workspace roles, invite engineers, and orchestrate Google Cloud MCP tooling."}
          </p>
        </div>

        {/* View Mode Toggle & Invite Action */}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl bg-muted p-1 border border-border text-xs">
            <button
              type="button"
              onClick={() => setViewMode("family")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg transition-all",
                viewMode === "family"
                  ? "bg-primary text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Home className="h-3.5 w-3.5" />
              <span>Family Sharing</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("team")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg transition-all",
                viewMode === "team"
                  ? "bg-primary text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Building className="h-3.5 w-3.5" />
              <span>Team & Business</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 rounded-xl shadow-md shadow-indigo-600/20"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>{viewMode === "family" ? "Invite Member" : "Invite Colleague"}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ══════════════════════════════════════════════════════
             1. MAIN COLLABORATION PANEL (FAMILY OR TEAM)
             ══════════════════════════════════════════════════════ */}
          {viewMode === "family" ? (
            <div className="space-y-6">
              {/* Top Banner: Credit Pool & Extra Member Add-On Dashboard */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left: Shared Pool & 4-Month Rollover (Col 7) */}
                <div className="lg:col-span-7 card p-5 border-indigo-500/40 bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-black/80 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-primary border border-indigo-500/30">
                          SHARED HOUSEHOLD POOL
                        </span>
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>4-MONTH ROLLOVER VAULT</span>
                        </span>
                      </div>

                      <span className="text-xs font-mono font-bold text-foreground bg-white/10 px-2.5 py-1 rounded-lg">
                        {familyData.planName}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-muted-foreground font-mono block">Active Spendable Pool</span>
                        <span className="text-3xl font-bold font-mono text-emerald-400">
                          ${(familyData.totalPoolCreditsCents / 100).toFixed(2)} USD
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          Includes ${(familyData.rolledOverCreditsCents / 100).toFixed(2)} rolled over from previous 3 months.
                        </p>
                      </div>

                      <Link
                        href="/dashboard/settings?tab=billing"
                        className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 shrink-0"
                      >
                        <span>Manage Plans</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>

                  {/* Rollover Vault 4-Month Status */}
                  <div className="mt-5 pt-3 border-t border-border grid grid-cols-4 gap-1.5 text-center text-xs">
                    {[
                      { label: "M1 Current", amt: "$60.00", active: true },
                      { label: "M2 Rollover", amt: "$45.00", active: true },
                      { label: "M3 Rollover", amt: "$40.00", active: true },
                      { label: "M4 Vault Cap", amt: "$30.00", active: true },
                    ].map((s, idx) => (
                      <div key={idx} className="rounded-xl bg-white/5 p-2 border border-white/5">
                        <span className="text-[10px] text-muted-foreground block">{s.label}</span>
                        <span className="font-mono text-emerald-300 font-bold text-xs mt-0.5 block">{s.amt}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Netflix-Style Extra Member Adder (+£4.99 / mo) (Col 5) */}
                <div className="lg:col-span-5 card p-5 border-purple-500/40 bg-gradient-to-br from-purple-950/30 via-black/80 to-black/90 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-400" />
                        <h3 className="text-sm font-bold text-foreground">Extra Member Seats Add-On</h3>
                      </div>
                      <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-purple-300 border border-purple-500/30">
                        £4.99 / seat / mo
                      </span>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                      Need more than your plan’s {familyData.baseSeats} included seats? Add up to{" "}
                      <strong className="text-foreground font-semibold">{familyData.maxExtraSeats} additional household members</strong>{" "}
                      for only <strong className="text-purple-300 font-mono">£4.99 / month</strong> each.
                    </p>

                    {/* Capacity breakdown */}
                    <div className="mt-4 rounded-xl bg-black/40 p-3 border border-border space-y-2">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground">Total Allowed Capacity:</span>
                        <span className="text-foreground font-bold">
                          {totalOccupiedSeats} / {totalCapacity} Seats Occupied
                        </span>
                      </div>

                      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden flex">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-300"
                          style={{ width: `${Math.min(100, (familyData.baseSeats / totalCapacity) * 100)}%` }}
                          title={`Base Included: ${familyData.baseSeats}`}
                        />
                        {familyData.extraSeatsCount > 0 && (
                          <div
                            className="h-full bg-purple-500 transition-all duration-300"
                            style={{ width: `${(familyData.extraSeatsCount / totalCapacity) * 100}%` }}
                            title={`Extra Purchased: ${familyData.extraSeatsCount}`}
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1">
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" />
                          <span>{familyData.baseSeats} Base Included</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-purple-500 inline-block" />
                          <span>{familyData.extraSeatsCount} Extra Added (+£{(familyData.extraSeatsCount * 4.99).toFixed(2)}/mo)</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Extra Seat Controls */}
                  <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={seatUpdating || familyData.extraSeatsCount <= 0 || totalOccupiedSeats >= totalCapacity}
                        onClick={handleRemoveExtraSeat}
                        className="h-8 w-8 rounded-lg bg-white/5 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors disabled:opacity-40"
                        title="Remove extra seat"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="font-mono text-sm font-bold text-foreground px-2">
                        {familyData.extraSeatsCount} Extra
                      </span>
                      <button
                        type="button"
                        disabled={seatUpdating || familyData.extraSeatsCount >= familyData.maxExtraSeats}
                        onClick={handleAddExtraSeat}
                        className="h-8 w-8 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-200 hover:bg-purple-600 hover:text-foreground transition-all disabled:opacity-40"
                        title="Add extra seat (+£4.99/mo)"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={seatUpdating || familyData.extraSeatsCount >= familyData.maxExtraSeats}
                      onClick={handleAddExtraSeat}
                      className="rounded-xl bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-md shadow-purple-600/30 hover:bg-purple-500 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {seatUpdating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      <span>Add Extra Seat (+£4.99/mo)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Household Members List */}
              <div className="card p-6 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-border">
                  <div>
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span>Household Members ({familyData.members.length} of {totalCapacity} Active)</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Each member gets their own private prompt library, isolated creations, and individual fair-use quota.
                    </p>
                  </div>

                  <span className="text-xs font-mono text-muted-foreground">
                    {totalCapacity - totalOccupiedSeats} available slots remaining
                  </span>
                </div>

                <div className="divide-y divide-white/10">
                  {familyData.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4 hover:bg-white/5 px-3 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-foreground font-mono font-bold text-sm shadow-md">
                          {member.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground">{member.name}</span>
                            {member.role === "organizer" ? (
                              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-mono font-bold text-amber-300 border border-amber-500/30">
                                ORGANIZER
                              </span>
                            ) : (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-mono text-primary border border-primary/20">
                                MEMBER
                              </span>
                            )}
                            {member.isExtraSeat && (
                              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[9px] font-mono text-purple-300 border border-purple-500/30">
                                EXTRA SEAT (+£4.99)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 self-end md:self-center">
                        {/* Private Library Status */}
                        <div className="text-left md:text-right hidden sm:block">
                          <span className="text-[10px] text-muted-foreground block font-mono">Workspace Privacy</span>
                          <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                            <Lock className="h-3 w-3" />
                            <span>Private Library</span>
                          </span>
                        </div>

                        {/* Monthly Fair-Use Quota */}
                        <div className="text-left md:text-right">
                          <span className="text-[10px] text-muted-foreground block font-mono">Monthly Fair-Use Cap</span>
                          <span className="text-xs font-mono font-bold text-foreground">
                            {member.monthlyQuotaCents ? `$${(member.monthlyQuotaCents / 100).toFixed(0)} / mo limit` : "Uncapped (Full Pool)"}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono block">
                            Spent: ${(member.currentMonthSpentCents / 100).toFixed(2)}
                          </span>
                        </div>

                        {/* Remove Action */}
                        {member.role !== "organizer" && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFamilyMember(member.id)}
                            className="rounded-lg p-2 text-muted-foreground hover:text-red-400 hover:bg-white/10 transition-colors"
                            title="Remove member from family pool"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick Add Member Prompt if Slots Available */}
                {totalCapacity > totalOccupiedSeats && (
                  <div className="pt-3 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(true)}
                      className="w-full py-3 rounded-xl border border-dashed border-white/20 hover:border-indigo-400/50 hover:bg-white/5 transition-all text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
                    >
                      <Plus className="h-4 w-4 text-primary" />
                      <span>Invite Member to Empty Slot ({totalCapacity - totalOccupiedSeats} left)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ══════════════════════════════════════════════════════
               2. ENTERPRISE & PRO TEAM PERSPECTIVE
               ══════════════════════════════════════════════════════ */
            <div className="space-y-6">
              <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div>
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Building className="h-4 w-4 text-primary" />
                      <span>Team Collaborators ({teamMembers.length} Active)</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Manage organization access, developer API keys, and workspace administration roles.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-white/10">
                  {teamMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-foreground font-mono font-bold text-xs">
                          {(m.name || m.email).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">{m.name || m.email.split("@")[0]}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{m.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-mono text-muted-foreground border border-border">
                          {m.role.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending Invitations */}
              {invitations.length > 0 && (
                <div className="card p-5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                    Pending Invitations ({invitations.length})
                  </h4>
                  <div className="divide-y divide-white/10">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between py-2.5 text-xs">
                        <div>
                          <p className="font-mono text-zinc-200">{inv.email}</p>
                          <span className="text-[10px] text-muted-foreground">Role: {inv.role}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => copyInviteLink(inv.token)}
                          className="btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1"
                        >
                          {copiedToken === inv.token ? <Check className="h-3 w-3 text-emerald-400" /> : <Mail className="h-3 w-3" />}
                          <span>{copiedToken === inv.token ? "Copied!" : "Copy Link"}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
             3. GOOGLE CLOUD & WORKSPACE MCP TOOLING PANEL
             ══════════════════════════════════════════════════════ */}
          {googleMcp && (
            <div className="card p-6 border-indigo-500/30 bg-gradient-to-br from-black/80 via-black/90 to-indigo-950/20 space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-primary border border-indigo-500/30">
                    <Cloud className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground">Google Cloud & Workspace MCP Tooling</h3>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-mono font-bold text-emerald-300 border border-emerald-500/30">
                        HEALTHY / ACTIVE
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Model Context Protocol (MCP) server integration for Google Vertex AI, Workspace Drive, and Cloud Storage.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={syncingMcp}
                  onClick={triggerGoogleMcpSync}
                  className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", syncingMcp && "animate-spin text-primary")} />
                  <span>{syncingMcp ? "Syncing IAM…" : mcpSyncedSuccess ? "Synced!" : "Sync Google IAM"}</span>
                </button>
              </div>

              {/* Connected Google Infrastructure Snapshot */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                  <span className="text-[10px] text-muted-foreground block font-sans">Connected Google Project</span>
                  <span className="text-foreground font-bold mt-0.5 block truncate">{googleMcp.projectId}</span>
                </div>

                <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                  <span className="text-[10px] text-muted-foreground block font-sans">Workspace Domain</span>
                  <span className="text-emerald-400 font-bold mt-0.5 block truncate">{googleMcp.workspaceDomain}</span>
                </div>

                <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                  <span className="text-[10px] text-muted-foreground block font-sans">Service Account Sync</span>
                  <span className="text-primary font-bold mt-0.5 block truncate">{googleMcp.serviceAccount}</span>
                </div>
              </div>

              {/* Active MCP Tools Grid */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span>Active Google MCP Protocol Tools</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {googleMcp.tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="rounded-xl border border-border bg-white/5 p-3.5 flex flex-col justify-between hover:border-indigo-500/40 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {tool.category === "vertex" && <Cpu className="h-4 w-4 text-purple-400" />}
                            {tool.category === "workspace" && <FolderSync className="h-4 w-4 text-blue-400" />}
                            {tool.category === "storage" && <Database className="h-4 w-4 text-amber-400" />}
                            {tool.category === "cloud" && <Cloud className="h-4 w-4 text-emerald-400" />}
                            <span className="text-xs font-bold text-foreground">{tool.name}</span>
                          </div>
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono text-emerald-300 border border-emerald-500/20">
                            {tool.status.toUpperCase()}
                          </span>
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {tool.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap gap-1.5">
                        {tool.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground border border-white/5"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Invite Member / Colleague Modal ── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowInviteModal(false)} />

          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 p-6 shadow-2xl backdrop-blur-2xl space-y-4"
            style={{ background: "rgba(16, 18, 28, 0.98)" }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">
                  {viewMode === "family" ? "Invite Household Member" : "Invite Team Colleague"}
                </h3>
              </div>
            </div>

            {inviteError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-2.5 text-xs text-red-400">
                {inviteError}
              </div>
            )}

            <form onSubmit={sendMemberInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@email.com"
                  className="input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Display Name (Optional)</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="input w-full text-sm"
                />
              </div>

              {viewMode === "family" ? (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Monthly Fair-Use Credit Cap (USD)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-muted-foreground">$</span>
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={inviteQuotaUsd}
                      onChange={(e) => setInviteQuotaUsd(e.target.value)}
                      className="input w-28 font-mono text-sm"
                    />
                    <span className="text-xs text-muted-foreground font-mono">USD / mo limit (protects pool)</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Workspace Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="input w-full text-sm font-mono"
                  >
                    <option value="member">Member (Can create & generate)</option>
                    <option value="admin">Admin (Can manage billing & users)</option>
                    <option value="viewer">Viewer (Read-only)</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="btn-primary text-xs px-4 py-2 flex items-center gap-2"
                >
                  {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  <span>Send Invite</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
