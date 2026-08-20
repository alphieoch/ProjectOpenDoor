import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { organizations, workspaceAgents } from "@opendoor/database";
import {
  getPlan,
  hasOpenBotSupervisor,
  readWorkspace,
  toAgentSlug,
  type ToolDefinition,
} from "@opendoor/shared";
import { getDb } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { bootAgent, stopAgent } from "@/lib/agents/boot";
import { restoreWorkspaceAgent, softDeleteWorkspaceAgent } from "@/lib/agents/lifecycle";
import { loadAgentsEntitlement } from "@/lib/agents/entitlement";
import { orgHasUnlimitedSpend } from "@/lib/credits";
import {
  LEADERBOT_TOOL_NAMES,
  decideHouseAction,
  decideSpawn,
  formatLeaderResourcePrompt,
  isHouseWideTarget,
  isLeaderbotName,
  isLeaderbotRecord,
  isLeaderbotSelfTarget,
  summarizeOpenBotCapacity,
  type OpenBotAgentKind,
  type OpenBotCapacity,
} from "@/lib/openbot-leader";
import { loadHouseManagement } from "@/lib/openbot-settings";
import { OPENBOT_ROSTER, findOpenBotPersonaByName, openBotCoworkerPrompt } from "@/lib/openbot-personas";
import {
  formatHouseMutationResult,
  formatListCoworkersResult,
  formatSpawnCoworkerResult,
} from "@/lib/openbot-tool-display";

export type LeaderToolEvent = { name: string; ok: boolean; detail: string; display?: string };

export type LeaderToolContext = {
  organizationId: string;
  leaderId: string;
  modelId: string;
  createdBy?: string | null;
};

type CoworkerRow = typeof workspaceAgents.$inferSelect;

function fn(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

export function isLeaderTool(name: string) {
  return (LEADERBOT_TOOL_NAMES as readonly string[]).includes(name);
}

export function leaderToolDefinitions(opts?: { houseManagement?: boolean }): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    fn("list_coworkers", "List OpenBot coworkers in this workspace with status, model, and computer attach state.", {}, []),
    fn(
      "inspect_resources",
      "Read addon, plan, model, concurrent-agent, and computer capacity. Call this before spawning.",
      {},
      [],
    ),
  ];
  if (opts?.houseManagement === false) return tools;
  return [
    ...tools,
    fn(
      "spawn_coworker",
      "Start or create a specialist coworker when the work needs one. Reuses an existing channel with the same name. Refuses when the addon is locked, no model is ready, the plan is at cap, or house management is off.",
      {
        persona: {
          type: "string",
          description: "Persona id or name: general, research, knowledge, metrics, or a custom channel name.",
        },
        brief: {
          type: "string",
          description: "Optional work to assign once the coworker is online.",
        },
      },
      ["persona"],
    ),
    fn(
      "stop_coworker",
      "Pause a coworker. Keeps chat and memory. Same as Stop in the OpenBot UI. Cannot stop Leaderbot. Pass persona \"all\" to stop every coworker except Leaderbot.",
      {
        persona: {
          type: "string",
          description: "Coworker name, persona id, agent id, or \"all\".",
        },
      },
      ["persona"],
    ),
    fn(
      "delete_coworker",
      "Soft-delete a coworker for 7 days (recoverable in OpenBot settings). Same as Delete in the UI. Cannot delete Leaderbot. Pass persona \"all\" to delete every coworker except Leaderbot.",
      {
        persona: {
          type: "string",
          description: "Coworker name, persona id, agent id, or \"all\".",
        },
      },
      ["persona"],
    ),
    fn(
      "restore_coworker",
      "Restore a coworker from the 7-day Recently deleted list. Same as Restore in OpenBot settings.",
      {
        persona: {
          type: "string",
          description: "Deleted coworker name or agent id.",
        },
      },
      ["persona"],
    ),
  ];
}

function isolationLabel(row: CoworkerRow) {
  const computer = readWorkspace(row.config).computer;
  if (computer.isolation.mode === "container") return "isolated Chromium";
  if (computer.backend === "live" || computer.isolation.mode === "shared") return "shared Chromium";
  return "in-process";
}

function coworkerKind(row: CoworkerRow): OpenBotAgentKind {
  return isLeaderbotRecord(row) ? "leader" : "coworker";
}

function serializeCoworker(row: CoworkerRow) {
  return {
    id: row.id,
    name: row.name,
    kind: coworkerKind(row),
    status: row.status,
    statusMessage: row.statusMessage,
    modelId: row.modelId,
    computer: isolationLabel(row),
  };
}

export async function loadOpenBotResources(orgId: string, modelId?: string): Promise<OpenBotCapacity & { coworkers: ReturnType<typeof serializeCoworker>[] }> {
  const db = getDb();
  const [rows, addon, org, unlimited] = await Promise.all([
    db
      .select()
      .from(workspaceAgents)
      .where(and(eq(workspaceAgents.organizationId, orgId), eq(workspaceAgents.runtime, "openbot"), isNull(workspaceAgents.deletedAt))),
    loadAgentsEntitlement(orgId),
    db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { plan: true },
    }),
    orgHasUnlimitedSpend(orgId),
  ]);
  const capacity = summarizeOpenBotCapacity({
    plan: org?.plan || getPlan(undefined).id,
    addonActive: addon.active || unlimited,
    addonStatus: addon.status,
    addonIncludedInPlan: addon.includedInPlan,
    modelId,
    supervisor: hasOpenBotSupervisor(),
    sharedComputer: Boolean(process.env.OPENBOT_COMPUTER_URL || process.env.AGENT_COMPUTER_URL),
    bots: rows.map((row) => ({
      status: row.status,
      computer: readWorkspace(row.config).computer,
    })),
  });
  return {
    ...capacity,
    coworkers: rows.map(serializeCoworker),
  };
}

export function formatLeaderContext(capacity: OpenBotCapacity, opts?: { houseManagement?: boolean }) {
  const house =
    opts?.houseManagement === false
      ? "House management is OFF. You cannot spawn, stop, or delete coworkers. Tell the person to enable “Leaderbot can add, stop, and delete coworkers” in OpenBot settings. Do not claim you changed the house."
      : "House management is ON. You can spawn_coworker, stop_coworker, and delete_coworker. When asked to start fresh or remove the other bots, list_coworkers then delete_coworker with persona \"all\" or each coworker except yourself. Never say you lack a tool.";
  return `${formatLeaderResourcePrompt(capacity)}\n${house}`;
}

async function uniqueSlug(orgId: string, name: string) {
  const db = getDb();
  const slugBase = toAgentSlug(name) || `agent-${Date.now().toString(36)}`;
  const existing = await db
    .select({ slug: workspaceAgents.slug })
    .from(workspaceAgents)
    .where(eq(workspaceAgents.organizationId, orgId));
  const taken = new Set(existing.map((row) => row.slug));
  let slug = slugBase;
  let n = 2;
  while (taken.has(slug)) {
    slug = `${slugBase}-${n}`.slice(0, 100);
    n += 1;
  }
  return slug;
}

async function createCoworker(opts: {
  organizationId: string;
  createdBy?: string | null;
  name: string;
  modelId: string;
  systemPrompt: string;
  kind: OpenBotAgentKind;
}) {
  const db = getDb();
  const slug = await uniqueSlug(opts.organizationId, opts.name);
  const createdBy =
    opts.createdBy && /^[0-9a-f-]{36}$/i.test(opts.createdBy) ? opts.createdBy : null;
  const [created] = await db
    .insert(workspaceAgents)
    .values({
      organizationId: opts.organizationId,
      createdBy,
      name: opts.name,
      slug,
      runtime: "openbot",
      modelId: opts.modelId,
      systemPrompt: opts.systemPrompt,
      status: "starting",
      statusMessage: `Booting OpenBot on ${opts.modelId}…`,
      config: { kind: opts.kind },
    })
    .returning();
  const ready = await bootAgent(created);
  await logAuditEvent({
    organizationId: opts.organizationId,
    userId: createdBy,
    action: "agent.created",
    entityType: "workspace_agent",
    entityId: created.id,
    metadata: { name: opts.name, runtime: "openbot", modelId: opts.modelId, via: "leaderbot", kind: opts.kind },
  });
  return ready;
}

async function assignBrief(agent: CoworkerRow, brief: string) {
  const { runAgentTurn } = await import("./engine");
  const result = await runAgentTurn({ agent, userText: brief });
  return result.reply;
}

function coworkerPersonaKey(raw: string) {
  const needle = raw.trim().toLowerCase();
  const exact = OPENBOT_ROSTER.find(
    (entry) => entry.id === needle || entry.name.toLowerCase() === needle,
  );
  return (exact ?? findOpenBotPersonaByName(raw))?.name || raw.trim();
}

function matchHouseTargets(
  coworkers: ReturnType<typeof serializeCoworker>[],
  raw: string,
  leaderId: string,
) {
  const key = raw.trim();
  if (isHouseWideTarget(key)) {
    return coworkers.filter((bot) => bot.kind !== "leader" && bot.id !== leaderId);
  }
  const named = coworkerPersonaKey(key);
  const hit =
    coworkers.find((bot) => bot.id === key) ||
    coworkers.find((bot) => bot.name.toLowerCase() === named.toLowerCase()) ||
    coworkers.find((bot) => bot.name.toLowerCase() === key.toLowerCase());
  return hit ? [hit] : [];
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function fail(name: string, reason: string, workspace: ReturnType<typeof readWorkspace>) {
  return {
    result: reason,
    display: reason,
    workspace,
    event: { name, ok: false, detail: reason, display: reason } satisfies LeaderToolEvent,
  };
}

function done(
  name: string,
  workspace: ReturnType<typeof readWorkspace>,
  opts: { result: string; display: string; ok?: boolean; detail?: string },
) {
  const ok = opts.ok !== false;
  return {
    result: opts.result,
    display: opts.display,
    workspace,
    event: { name, ok, detail: opts.detail ?? opts.display, display: opts.display } satisfies LeaderToolEvent,
  };
}

export async function executeLeaderTool(
  name: string,
  rawArgs: string,
  workspace: ReturnType<typeof readWorkspace>,
  ctx: LeaderToolContext,
) {
  const [resources, houseManagement] = await Promise.all([
    loadOpenBotResources(ctx.organizationId, ctx.modelId),
    loadHouseManagement(ctx.organizationId),
  ]);

  if (name === "list_coworkers") {
    const formatted = formatListCoworkersResult({
      coworkers: resources.coworkers,
      leaderId: ctx.leaderId,
    });
    return done(name, workspace, {
      result: formatted.result,
      display: formatted.display,
      detail: `${resources.coworkers.length} bot${resources.coworkers.length === 1 ? "" : "s"}`,
    });
  }

  if (name === "inspect_resources") {
    const display = resources.addonActive ? "Capacity looks ready." : "Agents add-on is locked.";
    return done(name, workspace, {
      result: [
        formatLeaderResourcePrompt(resources),
        "Coworkers:",
        ...resources.coworkers.map((bot) => `- ${bot.name} · ${bot.status} · ${bot.computer}`),
      ].join("\n"),
      display,
      detail: resources.addonActive ? "ready" : "locked",
    });
  }

  if (name === "spawn_coworker") {
    const gated = decideHouseAction({ enabled: houseManagement, action: "spawn" });
    if (!gated.allowed) return fail(name, gated.reason, workspace);
    const args = parseArgs(rawArgs);
    const personaKey = typeof args.persona === "string" ? args.persona.trim() : "";
    const brief = typeof args.brief === "string" ? args.brief.trim() : "";
    if (!personaKey) return fail(name, "persona is required.", workspace);
    if (isLeaderbotName(personaKey) || personaKey.toLowerCase() === "leader") {
      const decision = decideSpawn({
        capacity: resources,
        action: "create",
        source: "leader",
        requestedKind: "leader",
      });
      return fail(name, decision.reason, workspace);
    }

    const exact = OPENBOT_ROSTER.find(
      (entry) => entry.id === personaKey.toLowerCase() || entry.name.toLowerCase() === personaKey.toLowerCase(),
    );
    const persona = exact ?? findOpenBotPersonaByName(personaKey);
    if (persona?.id === "leader") {
      return fail(name, "Leaderbot cannot spawn another Leaderbot. Delegate to a specialist coworker instead.", workspace);
    }
    const coworkerName = (persona?.name || personaKey).slice(0, 200);
    const systemPrompt =
      persona?.systemPrompt ||
      openBotCoworkerPrompt(coworkerName, "Help with the work Leaderbot assigned. Be clear, concise, and accurate.");

    const existing = resources.coworkers.find(
      (bot) => bot.name.toLowerCase() === coworkerName.toLowerCase() && bot.kind !== "leader",
    );
    const db = getDb();

    if (existing) {
      const [row] = await db
        .select()
        .from(workspaceAgents)
        .where(and(eq(workspaceAgents.id, existing.id), eq(workspaceAgents.organizationId, ctx.organizationId)))
        .limit(1);
      if (!row) return fail(name, "That coworker disappeared before it could be started.", workspace);

      if (row.status === "running") {
        let reply = "";
        if (brief) reply = await assignBrief(row, brief);
        const formatted = formatSpawnCoworkerResult({
          id: row.id,
          name: row.name,
          status: row.status,
          mode: "reused",
          assignedReply: reply || undefined,
        });
        return done(name, workspace, {
          result: formatted.result,
          display: formatted.display,
          detail: `reused ${row.name}`,
        });
      }

      const decision = decideSpawn({
        capacity: resources,
        action: "start",
        source: "leader",
        requestedKind: "coworker",
      });
      if (!decision.allowed) return fail(name, decision.reason, workspace);
      const booted = await bootAgent(row);
      let reply = "";
      if (brief && booted.status === "running") reply = await assignBrief(booted, brief);
      const formatted = formatSpawnCoworkerResult({
        id: booted.id,
        name: booted.name,
        status: booted.status,
        mode: "online",
        assignedReply: reply || undefined,
        warning: decision.warning,
      });
      return done(name, workspace, {
        result: formatted.result,
        display: formatted.display,
        ok: booted.status === "running",
        detail: booted.status,
      });
    }

    const decision = decideSpawn({
      capacity: resources,
      action: "create",
      source: "leader",
      requestedKind: "coworker",
    });
    if (!decision.allowed) return fail(name, decision.reason, workspace);

    const created = await createCoworker({
      organizationId: ctx.organizationId,
      createdBy: ctx.createdBy,
      name: coworkerName,
      modelId: ctx.modelId,
      systemPrompt,
      kind: "coworker",
    });
    let reply = "";
    if (brief && created.status === "running") reply = await assignBrief(created, brief);
    const formatted = formatSpawnCoworkerResult({
      id: created.id,
      name: created.name,
      status: created.status,
      mode: "started",
      assignedReply: reply || undefined,
      warning: decision.warning,
    });
    return done(name, workspace, {
      result: formatted.result,
      display: formatted.display,
      ok: created.status !== "failed",
      detail: created.status,
    });
  }

  if (name === "stop_coworker" || name === "delete_coworker") {
    const action = name === "stop_coworker" ? "stop" : "delete";
    const args = parseArgs(rawArgs);
    const personaKey = typeof args.persona === "string" ? args.persona.trim() : "";
    if (!personaKey) return fail(name, "persona is required.", workspace);

    const targets = matchHouseTargets(resources.coworkers, personaKey, ctx.leaderId);
    if (targets.length === 0) {
      const gated = decideHouseAction({ enabled: houseManagement, action });
      if (!gated.allowed) return fail(name, gated.reason, workspace);
      if (isHouseWideTarget(personaKey)) {
        return fail(name, "No coworkers to change. Leaderbot stays.", workspace);
      }
      return fail(name, `No coworker matched “${personaKey}”. Call list_coworkers and use a name from that list.`, workspace);
    }

    const outcomes: Array<{ ok: boolean; id?: string; name: string; reason?: string }> = [];
    for (const target of targets) {
      const self = isLeaderbotSelfTarget({
        leaderId: ctx.leaderId,
        targetId: target.id,
        targetName: target.name,
        targetKind: target.kind,
      });
      const decision = decideHouseAction({
        enabled: houseManagement,
        action,
        targetIsLeader: self,
      });
      if (!decision.allowed) {
        outcomes.push({ ok: false, id: target.id, name: target.name, reason: decision.reason });
        continue;
      }

      const db = getDb();
      const [row] = await db
        .select()
        .from(workspaceAgents)
        .where(and(eq(workspaceAgents.id, target.id), eq(workspaceAgents.organizationId, ctx.organizationId), isNull(workspaceAgents.deletedAt)))
        .limit(1);
      if (!row) {
        outcomes.push({
          ok: false,
          id: target.id,
          name: target.name,
          reason: "that coworker disappeared before the change could be applied.",
        });
        continue;
      }

      if (action === "stop") {
        if (row.status !== "stopped") {
          await stopAgent(row);
          await logAuditEvent({
            organizationId: ctx.organizationId,
            userId: ctx.createdBy,
            action: "agent.stopped",
            entityType: "workspace_agent",
            entityId: row.id,
            metadata: { name: row.name, runtime: row.runtime, via: "leaderbot" },
          });
        }
        outcomes.push({ ok: true, id: row.id, name: row.name });
        continue;
      }

      await softDeleteWorkspaceAgent(row);
      await logAuditEvent({
        organizationId: ctx.organizationId,
        userId: ctx.createdBy,
        action: "agent.deleted",
        entityType: "workspace_agent",
        entityId: row.id,
        metadata: { name: row.name, runtime: row.runtime, softDelete: true, via: "leaderbot" },
      });
      outcomes.push({ ok: true, id: row.id, name: row.name });
    }

    const formatted = formatHouseMutationResult({ action, outcomes });
    return done(name, workspace, {
      result: formatted.result,
      display: formatted.display,
      ok: formatted.ok,
      detail: `${targets.length} target${targets.length === 1 ? "" : "s"}`,
    });
  }

  if (name === "restore_coworker") {
    const gated = decideHouseAction({ enabled: houseManagement, action: "restore" });
    if (!gated.allowed) return fail(name, gated.reason, workspace);
    const args = parseArgs(rawArgs);
    const personaKey = typeof args.persona === "string" ? args.persona.trim() : "";
    if (!personaKey) return fail(name, "persona is required.", workspace);

    const db = getDb();
    const deleted = await db
      .select()
      .from(workspaceAgents)
      .where(
        and(
          eq(workspaceAgents.organizationId, ctx.organizationId),
          eq(workspaceAgents.runtime, "openbot"),
          isNotNull(workspaceAgents.deletedAt),
        ),
      );
    const named = coworkerPersonaKey(personaKey);
    const row =
      deleted.find((bot) => bot.id === personaKey) ||
      deleted.find((bot) => bot.name.toLowerCase() === named.toLowerCase()) ||
      deleted.find((bot) => bot.name.toLowerCase() === personaKey.toLowerCase());
    if (!row) return fail(name, `No deleted coworker matched “${personaKey}”.`, workspace);

    const restored = await restoreWorkspaceAgent(row);
    await logAuditEvent({
      organizationId: ctx.organizationId,
      userId: ctx.createdBy,
      action: "agent.restored",
      entityType: "workspace_agent",
      entityId: row.id,
      metadata: { name: row.name, runtime: row.runtime, via: "leaderbot" },
    });
    const formatted = formatHouseMutationResult({
      action: "restore",
      outcomes: [{ ok: true, id: restored.id, name: restored.name }],
    });
    return done(name, workspace, {
      result: formatted.result,
      display: formatted.display,
      detail: `restored ${restored.name}`,
    });
  }

  return fail(name, `Unknown Leaderbot tool ${name}`, workspace);
}
