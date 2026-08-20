"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyOpenBotChannelsChanged } from "./use-openbot-workspace";

type SettingsPayload = {
  workspace: string;
  houseManagement?: boolean;
  addon: { active: boolean; amountUsd: number; includedInPlan: boolean; status: string };
  bots: Array<{
    id: string;
    name: string;
    status: string;
    statusMessage?: string | null;
    modelId: string;
    isolation: string;
    lastUsedAt?: string | null;
    messages30d: number;
    skills: string[];
  }>;
  deletedBots: Array<{
    id: string;
    name: string;
    deletedAt: string;
    daysLeft: number;
    recoverUntil: string;
  }>;
  usage: { bots: number; running: number; messages30d: number };
  members: Array<{ id: string; name: string; email: string; role: string }>;
  plugins: string[];
  sso: {
    enterprise: boolean;
    plan: string;
    enabled: boolean;
    defaultRole: string;
    connectionId: string | null;
    organizationId: string | null;
  };
};

export function OpenBotSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [houseManagement, setHouseManagement] = useState(true);
  const [savingHouse, setSavingHouse] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/agents/openbot/settings", { credentials: "include" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load OpenBot settings");
        return body as SettingsPayload;
      })
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setHouseManagement(payload.houseManagement !== false);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load OpenBot settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>OpenBot settings</DialogTitle>
          <DialogDescription>
            Workspace access, usage, plugins, and SSO for OpenBot on this account.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : data ? (
            <>
              <section>
                <h3 className="text-sm font-semibold text-foreground">House management</h3>
                <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-border accent-[hsl(var(--info))]"
                    checked={houseManagement}
                    disabled={savingHouse}
                    onChange={(event) => {
                      const next = event.target.checked;
                      const previous = houseManagement;
                      setHouseManagement(next);
                      setSavingHouse(true);
                      fetch("/api/agents/openbot/settings", {
                        method: "PATCH",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ houseManagement: next }),
                      })
                        .then(async (res) => {
                          const body = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(body.error || "Could not save house management");
                        })
                        .catch((caught) => {
                          setHouseManagement(previous);
                          setError(caught instanceof Error ? caught.message : "Could not save house management");
                        })
                        .finally(() => setSavingHouse(false));
                    }}
                  />
                  <span>
                    <span className="text-sm font-medium text-foreground">
                      Leaderbot can add, stop, and delete coworkers
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      When off, Leaderbot can still list the house but cannot change who is in it.
                    </span>
                  </span>
                </label>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-foreground">Bot info</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.workspace} · Agents add-on {data.addon.active ? "on" : "off"}
                  {data.addon.includedInPlan ? " (included)" : ` · $${data.addon.amountUsd}/mo`}
                </p>
                {data.bots.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No OpenBot coworkers yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {data.bots.map((bot) => (
                      <li key={bot.id} className="rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/dashboard/openbot/${bot.id}`} className="text-sm font-medium hover:underline">
                            {bot.name}
                          </Link>
                          <span className="text-[11px] text-muted-foreground">{bot.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {bot.modelId} · {bot.isolation} · {bot.messages30d} messages / 30d
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {data.deletedBots.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Recently deleted</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recover within 7 days. After that they are gone.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {data.deletedBots.map((bot) => (
                      <li key={bot.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{bot.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {bot.daysLeft === 1 ? "1 day left" : `${bot.daysLeft} days left`}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={restoringId === bot.id}
                          onClick={() => {
                            setRestoringId(bot.id);
                            fetch(`/api/agents/${bot.id}/restore`, { method: "POST", credentials: "include" })
                              .then(async (res) => {
                                const body = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(body.error || "Could not restore");
                                notifyOpenBotChannelsChanged();
                                return fetch("/api/agents/openbot/settings", { credentials: "include" });
                              })
                              .then(async (res) => {
                                if (!res) return;
                                const next = await res.json().catch(() => null);
                                if (next) setData(next as SettingsPayload);
                              })
                              .catch((caught) => {
                                setError(caught instanceof Error ? caught.message : "Could not restore");
                              })
                              .finally(() => setRestoringId(null));
                          }}
                        >
                          {restoringId === bot.id ? <Loader2 className="size-3 animate-spin" /> : null}
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="text-sm font-semibold text-foreground">Usage</h3>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <UsageStat label="Bots" value={data.usage.bots} />
                  <UsageStat label="Running" value={data.usage.running} />
                  <UsageStat label="Messages / 30d" value={data.usage.messages30d} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-foreground">Who has access</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Everyone on this workspace can open OpenBot. Roles come from the team list.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {data.members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{member.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {member.role} · {member.email}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-foreground">Plugins</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Skills and the computer attached to these coworkers.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.plugins.map((plugin) => (
                    <span key={plugin} className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
                      {plugin}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-foreground">SSO access</h3>
                {data.sso.enterprise ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-foreground">
                      {data.sso.enabled ? "SSO is on for this workspace." : "SSO is off."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Default role {data.sso.defaultRole}
                      {data.sso.connectionId ? ` · connection ${data.sso.connectionId}` : ""}
                    </p>
                    <Link href="/dashboard/settings" className="text-xs underline">
                      Manage SSO in Settings
                    </Link>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    SSO for OpenBot is on Enterprise. This workspace is on {data.sso.plan}.{" "}
                    <Link href="/dashboard/settings?tab=billing" className="underline">
                      Upgrade
                    </Link>
                  </p>
                )}
              </section>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UsageStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
