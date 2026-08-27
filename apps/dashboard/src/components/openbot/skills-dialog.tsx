"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import {
  OPENBOT_SKILL_CATALOG,
  hasSkillNamed,
  parseCustomSkillDraft,
  resolveOpenBotSkillTarget,
} from "@opendoor/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyOpenBotChannelsChanged, type OpenBotChannel } from "./use-openbot-workspace";

const fieldClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/20";

export function OpenBotSkillsDialog({
  open,
  onOpenChange,
  channels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: OpenBotChannel[];
}) {
  const pathname = usePathname();
  const activeId = pathname?.startsWith("/dashboard/openbot/") ? pathname.split("/")[3] : undefined;
  const defaultTarget = useMemo(
    () => resolveOpenBotSkillTarget(channels, activeId),
    [channels, activeId],
  );
  const [targetId, setTargetId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", instructions: "" });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowCreate(false);
    setDraft({ name: "", description: "", instructions: "" });
    setTargetId(defaultTarget?.id ?? "");
  }, [open, defaultTarget?.id]);

  const target = channels.find((channel) => channel.id === targetId);
  const catalogIds = useMemo(() => new Set(OPENBOT_SKILL_CATALOG.map((item) => item.id)), []);
  const customSkills = useMemo(() => {
    const seen = new Map<string, { name: string; agents: string[] }>();
    for (const channel of channels) {
      for (const skill of channel.workspace?.skills || []) {
        if (catalogIds.has(skill.name)) continue;
        const entry = seen.get(skill.name) || { name: skill.name, agents: [] };
        entry.agents.push(channel.name);
        seen.set(skill.name, entry);
      }
    }
    return [...seen.values()];
  }, [catalogIds, channels]);

  async function persist(body: Record<string, unknown>, busyKey: string) {
    if (!target) {
      setError(channels.length === 0
        ? "Start a coworker first, then attach a skill."
        : "Choose which coworker should get this skill.");
      return;
    }
    setBusyId(busyKey);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not save that skill");
      notifyOpenBotChannelsChanged();
      if (busyKey === "create") {
        setDraft({ name: "", description: "", instructions: "" });
        setShowCreate(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that skill");
    } finally {
      setBusyId(null);
    }
  }

  function createSkill() {
    const parsed = parseCustomSkillDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    void persist({ skill: draft }, "create");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Skills</DialogTitle>
          <DialogDescription>
            Premade playbooks the coworker will follow. Enable one, or write the exact instructions you need.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Start a channel first. Skills attach to a coworker, not to the workspace as a whole.
            </p>
          ) : (
            <label className="block text-sm">
              <span className="text-xs font-medium text-muted-foreground">Add to</span>
              <select
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                className={fieldClass}
                aria-label="Coworker to add skills to"
              >
                {defaultTarget ? null : <option value="">Choose a coworker</option>}
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                    {channel.kind === "leader" || channel.workspace?.kind === "leader" ? " · Lead" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <ul className="space-y-2">
            {OPENBOT_SKILL_CATALOG.map((item) => {
              const onAgents = channels.filter((channel) =>
                hasSkillNamed(channel.workspace?.skills || [], item.id),
              );
              const onTarget = Boolean(target && hasSkillNamed(target.workspace?.skills || [], item.id));
              const busy = busyId === item.id;
              return (
                <li key={item.id} className="rounded-lg border border-border px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">Helps with {item.helpsWith}</p>
                      {onAgents.length > 0 ? (
                        <p className="mt-1 text-[11px] text-foreground/70">
                          On {onAgents.map((agent) => agent.name).join(", ")}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">Not on a coworker yet</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm shrink-0"
                      disabled={!target || onTarget || busy || Boolean(busyId)}
                      onClick={() => void persist({ skillCatalogId: item.id }, item.id)}
                    >
                      {busy ? <Loader2 className="size-3 animate-spin" /> : null}
                      {onTarget ? "On" : "Enable"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {customSkills.length > 0 ? (
            <section>
              <h3 className="text-sm font-semibold text-foreground">Your skills</h3>
              <ul className="mt-2 space-y-2">
                {customSkills.map((skill) => (
                  <li key={skill.name} className="rounded-lg border border-border px-3 py-2">
                    <p className="text-sm text-foreground">{skill.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">On {skill.agents.join(", ")}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {showCreate ? (
            <section className="space-y-3 rounded-lg border border-border px-3 py-3">
              <h3 className="text-sm font-semibold text-foreground">Create a skill</h3>
              <p className="text-xs text-muted-foreground">
                Name it for the job, then write the instructions the coworker should follow every time.
              </p>
              <label className="block text-sm">
                <span className="text-xs font-medium text-muted-foreground">Name</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Weekly recap"
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-medium text-muted-foreground">Description</span>
                <input
                  value={draft.description}
                  onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Friday note for the team"
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-medium text-muted-foreground">Instructions</span>
                <textarea
                  value={draft.instructions}
                  onChange={(event) => setDraft((prev) => ({ ...prev, instructions: event.target.value }))}
                  placeholder="What should this coworker do, in order, and when should it ask for help?"
                  rows={5}
                  className={`${fieldClass} resize-y`}
                />
              </label>
            </section>
          ) : null}
        </div>
        <DialogFooter>
          {showCreate ? (
            <>
              <button type="button" className="btn-ghost" disabled={Boolean(busyId)} onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!target || Boolean(busyId)}
                onClick={createSkill}
              >
                {busyId === "create" ? <Loader2 className="size-4 animate-spin" /> : null}
                {target ? `Create on ${target.name}` : "Create skill"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              disabled={channels.length === 0}
              onClick={() => {
                setShowCreate(true);
                setError(null);
              }}
            >
              <Plus className="size-4" />
              Create a skill
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
