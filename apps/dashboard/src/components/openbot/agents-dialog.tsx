"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  findExistingLeaderbot,
  isLeaderbotChannel,
  pinLeaderbotFirst,
  type OpenBotCapacity,
} from "@/lib/openbot-leader";
import { summarizeHouseStatus } from "@/lib/openbot-house";
import { OPENBOT_ROSTER } from "@/lib/openbot-personas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GradientAvatar } from "./gradient-avatar";
import {
  buildAgentsQuotaView,
  describeAgentsQuota,
  type CatalogModelOption,
} from "./agents-quota";
import { notifyOpenBotChannelsChanged, type AgentsAddon, type OpenBotChannel } from "./use-openbot-workspace";

const fieldClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/20";

type SettingsPayload = {
  usage?: { bots?: number; running?: number; messages30d?: number };
  limits?: {
    bots?: number;
    maxBots?: number;
    running?: number;
    maxConcurrentAgents?: number;
    plan?: string;
    addonActive?: boolean;
  };
  addon?: { active?: boolean; includedInPlan?: boolean; amountUsd?: number; status?: string };
};

type BalancePayload = {
  creditsUsdCents?: number;
  includedQuotaCents?: number;
  prepaidCreditsUsdCents?: number;
  includedMonthlyCents?: number;
};

export function OpenBotAgentsDialog({
  open,
  onOpenChange,
  channels,
  models,
  capacity,
  addon,
  pending,
  error,
  startChannel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: OpenBotChannel[];
  models: CatalogModelOption[];
  capacity: OpenBotCapacity | null;
  addon: AgentsAddon | null;
  pending: boolean;
  error: string | null;
  startChannel: (raw: string, personaId?: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [balance, setBalance] = useState<BalancePayload | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const coworkers = useMemo(() => pinLeaderbotFirst(channels), [channels]);
  const houseStatus = useMemo(() => summarizeHouseStatus(coworkers), [coworkers]);
  const locked = Boolean(addon && !addon.active);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLocalError(null);
    setQuotaError(null);
    setQuotaLoading(true);
    Promise.allSettled([
      fetch("/api/agents/openbot/settings", { credentials: "include" }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load OpenBot usage");
        return body as SettingsPayload;
      }),
      fetch("/api/billing/balance", { credentials: "include" }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load credits");
        return body as BalancePayload;
      }),
    ])
      .then(([settingsResult, balanceResult]) => {
        if (cancelled) return;
        setSettings(settingsResult.status === "fulfilled" ? settingsResult.value : null);
        setBalance(balanceResult.status === "fulfilled" ? balanceResult.value : null);
        const failed = [settingsResult, balanceResult].find((result) => result.status === "rejected");
        setQuotaError(
          failed && failed.status === "rejected"
            ? failed.reason instanceof Error
              ? failed.reason.message
              : "Could not load usage"
            : null,
        );
      })
      .finally(() => {
        if (!cancelled) setQuotaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const quota = useMemo(
    () =>
      buildAgentsQuotaView({
        settings: settings || { addon: addon ?? undefined },
        balance,
        capacity,
        channelCount: channels.length,
      }),
    [addon, balance, capacity, channels.length, settings],
  );
  const quotaLabels = describeAgentsQuota(quota);

  const missingRoster = useMemo(
    () =>
      OPENBOT_ROSTER.filter((persona) => {
        if (persona.id === "leader") return !findExistingLeaderbot(channels);
        return !channels.some((channel) => channel.name.toLowerCase() === persona.name.toLowerCase());
      }),
    [channels],
  );

  async function changeModel(agentId: string, modelId: string) {
    setBusyId(agentId);
    setLocalError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modelId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not change that model");
      notifyOpenBotChannelsChanged();
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Could not change that model");
    } finally {
      setBusyId(null);
    }
  }

  async function openExisting(channel: OpenBotChannel) {
    onOpenChange(false);
    router.push(`/dashboard/openbot/${channel.id}`);
  }

  async function startPersona(personaId: string) {
    setStartingId(personaId);
    setLocalError(null);
    try {
      await startChannel("", personaId);
      onOpenChange(false);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Could not start that coworker");
    } finally {
      setStartingId(null);
    }
  }

  const banner = localError || error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agents</DialogTitle>
          <DialogDescription>
            Manage coworkers, pick each model, and see usage against this workspace&apos;s plan.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="text-sm font-semibold text-foreground">Usage and quota</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {quota.plan} plan · Agents add-on {quota.addonLabel.toLowerCase()}
              {quota.messages30d ? ` · ${quota.messages30d} messages / 30d` : ""}
            </p>
            {quotaLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <QuotaStat label="Spent (stipend)" value={quotaLabels.spend} />
                <QuotaStat label="Credits left" value={quotaLabels.remaining} />
                <QuotaStat label="Stipend left" value={quotaLabels.stipend} />
                <QuotaStat label="Agents / keys" value={quotaLabels.agents} />
                <QuotaStat label="Running / deployments" value={quotaLabels.running} />
                <QuotaStat label="Add-on" value={quota.addonLabel} />
              </div>
            )}
            {quotaError ? <p className="mt-2 text-xs text-muted-foreground">{quotaError}</p> : null}
          </section>

          {banner ? (
            <p className="text-sm text-destructive" role="alert">
              {banner}
            </p>
          ) : null}

          <section>
            <h3 className="text-sm font-semibold text-foreground">This house</h3>
            {coworkers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No OpenBot coworkers yet. Start Leaderbot or a specialist below.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  {houseStatus.line}
                  {houseStatus.running ? ` · ${houseStatus.running} running` : ""}
                </p>
              <ul className="mt-3 space-y-2">
                {coworkers.map((channel) => {
                  const lead = isLeaderbotChannel(channel);
                  const currentModel = channel.modelId || "";
                  const options = models.some((model) => model.id === currentModel) || !currentModel
                    ? models
                    : [{ id: currentModel, label: currentModel }, ...models];
                  const busy = busyId === channel.id;
                  return (
                    <li key={channel.id} className="rounded-lg border border-border px-3 py-3">
                      <div className="flex items-start gap-3">
                        <GradientAvatar
                          seed={channel.id}
                          name={channel.name}
                          size={36}
                          status={channel.status}
                          computerStatus={channel.workspace?.computer?.status}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{channel.name}</p>
                            {lead ? (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                House · Lead
                              </span>
                            ) : null}
                            <span className="text-[11px] text-muted-foreground">{channel.status}</span>
                          </div>
                          <label className="mt-2 block text-sm">
                            <span className="text-xs font-medium text-muted-foreground">Model</span>
                            <select
                              value={currentModel}
                              disabled={busy || options.length === 0}
                              aria-label={`Model for ${channel.name}`}
                              onChange={(event) => void changeModel(channel.id, event.target.value)}
                              className={fieldClass}
                            >
                              {currentModel ? null : <option value="">Choose a model</option>}
                              {options.map((model) => (
                                <option
                                  key={model.id}
                                  value={model.id}
                                  disabled={model.ready === false && model.id !== currentModel}
                                >
                                  {model.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary btn-sm shrink-0"
                          onClick={() => void openExisting(channel)}
                        >
                          Open
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </section>

          {missingRoster.length > 0 ? (
            <section>
              <h3 className="text-sm font-semibold text-foreground">Start a coworker</h3>
              <ul className="mt-3 space-y-2">
                {missingRoster.map((persona) => {
                  const starting = startingId === persona.id;
                  return (
                    <li key={persona.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{persona.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{persona.roleDescription}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary btn-sm shrink-0"
                        disabled={locked || pending || Boolean(startingId)}
                        onClick={() => void startPersona(persona.id)}
                      >
                        {starting ? <Loader2 className="size-3 animate-spin" /> : null}
                        Start
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuotaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
