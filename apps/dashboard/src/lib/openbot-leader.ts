import { getPlan } from "@opendoor/shared";

export const LEADERBOT_ID = "leader" as const;
export const LEADERBOT_NAME = "Leaderbot";
export const LEADERBOT_KIND = "leader" as const;
export const LEADERBOT_READ_TOOL_NAMES = ["list_coworkers", "inspect_resources"] as const;
export const LEADERBOT_MANAGE_TOOL_NAMES = [
  "spawn_coworker",
  "stop_coworker",
  "delete_coworker",
  "restore_coworker",
] as const;
export const LEADERBOT_TOOL_NAMES = [
  ...LEADERBOT_READ_TOOL_NAMES,
  ...LEADERBOT_MANAGE_TOOL_NAMES,
] as const;

export const LEADERBOT_TURN_GUIDANCE = [
  "You are Leaderbot, the house lead for this OpenBot workspace.",
  "Your job is orchestration: list coworkers, inspect capacity, and add, stop, or delete specialists when asked.",
  "For a simple greeting (hi, hello, hey), reply briefly in character as the house lead.",
  "Do not introduce yourself with a capabilities list.",
  "Do not advertise web browsing, Chromium, or file management unless the person asked for those.",
  "Coworkers handle browsing, research, files, and specialist work. You coordinate them.",
  "You have computer tools. Use them only when the person asks you to open a page or a file.",
].join(" ");

export const LEADERBOT_ROLE = [
  "You orchestrate the other OpenBot coworkers in this workspace: General Assistant, Research, Knowledge, Metrics, and any user-created channels.",
  "Use list_coworkers to see who exists and whether they are running.",
  "Use inspect_resources before bringing anyone new online.",
  "When house management is on, use spawn_coworker to start a specialist, stop_coworker to pause one (chat and memory stay), and delete_coworker to soft-delete one for 7 days.",
  "When the person asks to delete the other bots, start fresh, or remove coworkers, call list_coworkers, then delete_coworker for each coworker except yourself — or pass persona \"all\". You have these tools; never say you cannot delete or stop a coworker.",
  "Never spawn blindly. If a tool says you cannot (addon locked, no model, at cap, or house management off), tell the person that reason and stop.",
  "Do not create another Leaderbot. Do not stop or delete yourself. Do not invent bots that are not in list_coworkers.",
  "Prefer an existing coworker over a new one. Bring a stopped coworker online instead of duplicating it.",
].join(" ");

export function leaderbotSystemPrompt() {
  return `${LEADERBOT_TURN_GUIDANCE} ${LEADERBOT_ROLE}`;
}

export function withLeaderbotTurnGuidance(storedPrompt: string) {
  if (storedPrompt.includes(LEADERBOT_TURN_GUIDANCE.slice(0, 48))) return storedPrompt;
  return `${LEADERBOT_TURN_GUIDANCE}\n\n${storedPrompt}`;
}

export function leaderToolsForSettings(houseManagement: boolean): readonly string[] {
  return houseManagement ? LEADERBOT_TOOL_NAMES : LEADERBOT_READ_TOOL_NAMES;
}

export type OpenBotAgentKind = "leader" | "coworker";

export type OpenBotComputerCapacity = {
  supervisor: boolean;
  sharedComputer: boolean;
  live: number;
  inProcess: number;
  isolated: number;
};

export type OpenBotCapacity = {
  plan: string;
  enterprise: boolean;
  addonActive: boolean;
  addonStatus: string;
  addonIncludedInPlan: boolean;
  modelId: string;
  modelReady: boolean;
  bots: number;
  running: number;
  maxBots: number;
  maxConcurrentAgents: number;
  computer: OpenBotComputerCapacity;
};

export type SpawnAction = "create" | "start" | "reuse";

export type SpawnDecisionCode =
  | "ok"
  | "addon_locked"
  | "model_missing"
  | "at_bot_cap"
  | "at_concurrent_cap"
  | "leader_forbidden"
  | "duplicate_leader";

export type SpawnDecision = {
  allowed: boolean;
  code: SpawnDecisionCode;
  reason: string;
  warning?: string;
};

export type LeaderbotIdentity = {
  name?: string | null;
  kind?: string | null;
  workspace?: { kind?: string | null } | null;
};

export function isLeaderbotName(name: string | null | undefined) {
  return (name || "").trim().toLowerCase() === LEADERBOT_NAME.toLowerCase();
}

export function isLeaderbotChannel(channel: LeaderbotIdentity) {
  if (channel.kind === LEADERBOT_KIND || channel.workspace?.kind === LEADERBOT_KIND) return true;
  return isLeaderbotName(channel.name);
}

export function isLeaderbotRecord(row: { name?: string | null; config?: unknown }) {
  const kind =
    row.config && typeof row.config === "object" && "kind" in row.config
      ? (row.config as { kind?: unknown }).kind
      : undefined;
  return isLeaderbotChannel({
    name: row.name,
    kind: typeof kind === "string" ? kind : undefined,
  });
}

export function findExistingLeaderbot<T extends LeaderbotIdentity>(channels: T[]): T | undefined {
  return channels.find((channel) => isLeaderbotChannel(channel));
}

export function pinLeaderbotFirst<T extends LeaderbotIdentity>(channels: T[]): T[] {
  const leaders: T[] = [];
  const rest: T[] = [];
  for (const channel of channels) {
    if (isLeaderbotChannel(channel)) leaders.push(channel);
    else rest.push(channel);
  }
  return [...leaders, ...rest];
}

export function openBotLimitsForPlan(planId: string | null | undefined) {
  const plan = getPlan(planId);
  return {
    plan: plan.id,
    enterprise: plan.id === "enterprise",
    maxBots: plan.maxApiKeys,
    maxConcurrentAgents: plan.maxActiveDeployments,
  };
}

export function summarizeOpenBotCapacity(input: {
  plan?: string | null;
  addonActive: boolean;
  addonStatus?: string | null;
  addonIncludedInPlan?: boolean;
  modelId?: string | null;
  supervisor?: boolean;
  sharedComputer?: boolean;
  bots: Array<{
    status?: string | null;
    computer?: { backend?: string | null; isolation?: { mode?: string | null } | null } | null;
  }>;
}): OpenBotCapacity {
  const limits = openBotLimitsForPlan(input.plan);
  const running = input.bots.filter((bot) => bot.status === "running" || bot.status === "starting").length;
  let live = 0;
  let inProcess = 0;
  let isolated = 0;
  for (const bot of input.bots) {
    const mode = bot.computer?.isolation?.mode;
    if (mode === "container") isolated += 1;
    else if (mode === "in-process" || !mode) inProcess += 1;
    if (bot.computer?.backend === "live") live += 1;
  }
  return {
    ...limits,
    addonActive: input.addonActive,
    addonStatus: input.addonStatus || "inactive",
    addonIncludedInPlan: Boolean(input.addonIncludedInPlan),
    modelId: (input.modelId || "").trim(),
    modelReady: Boolean((input.modelId || "").trim()),
    bots: input.bots.length,
    running,
    computer: {
      supervisor: Boolean(input.supervisor),
      sharedComputer: Boolean(input.sharedComputer),
      live,
      inProcess,
      isolated,
    },
  };
}

export function computerCapacityNote(capacity: OpenBotCapacity) {
  if (capacity.computer.supervisor) {
    return "Supervised computers are configured; a new bot gets its own container when the supervisor is reachable.";
  }
  if (capacity.computer.sharedComputer) {
    return "A shared live computer URL is configured. New bots share that Chromium until a supervisor is attached.";
  }
  return "Live computer is not attached. New bots get an in-process computer until the supervisor or OPENBOT_COMPUTER_URL is available.";
}

export function decideSpawn(input: {
  capacity: OpenBotCapacity;
  action: SpawnAction;
  source?: "user" | "leader";
  requestedKind?: OpenBotAgentKind;
  alreadyExists?: boolean;
}): SpawnDecision {
  const { capacity, action } = input;
  const requestedKind = input.requestedKind || "coworker";
  const warning = computerCapacityNote(capacity);

  if (input.source === "leader" && requestedKind === "leader") {
    return {
      allowed: false,
      code: "leader_forbidden",
      reason: "Leaderbot cannot spawn another Leaderbot. Delegate to a specialist coworker instead.",
    };
  }

  if (requestedKind === "leader" && input.alreadyExists) {
    return {
      allowed: false,
      code: "duplicate_leader",
      reason: "Leaderbot already exists in this workspace. Open the existing channel instead of creating another.",
    };
  }

  if (action === "reuse") {
    return { allowed: true, code: "ok", reason: "That coworker is already online.", warning };
  }

  if (!capacity.addonActive) {
    return {
      allowed: false,
      code: "addon_locked",
      reason: "The Agents add-on is not active on this workspace, so no new bots can come online.",
    };
  }

  if (!capacity.modelReady || !capacity.modelId) {
    return {
      allowed: false,
      code: "model_missing",
      reason: "No catalog model is ready, so a new bot cannot be booted.",
    };
  }

  if (action === "create" && capacity.bots >= capacity.maxBots) {
    return {
      allowed: false,
      code: "at_bot_cap",
      reason: `This ${capacity.plan} plan allows ${capacity.maxBots} agent keys. Stop or delete a bot before creating another.`,
    };
  }

  if ((action === "create" || action === "start") && capacity.running >= capacity.maxConcurrentAgents) {
    return {
      allowed: false,
      code: "at_concurrent_cap",
      reason: `This ${capacity.plan} plan allows ${capacity.maxConcurrentAgents} concurrent running agents. Stop one before bringing another online.`,
    };
  }

  return {
    allowed: true,
    code: "ok",
    reason: action === "start" ? "That coworker can be brought online." : "A new coworker can be created.",
    warning,
  };
}

export function formatLeaderResourcePrompt(capacity: OpenBotCapacity) {
  return [
    "Workspace resources (do not invent different numbers):",
    `Plan: ${capacity.plan}${capacity.enterprise ? " (enterprise)" : ""}. Agents add-on: ${capacity.addonActive ? "active" : "LOCKED"} (${capacity.addonStatus}).`,
    `Model for new bots: ${capacity.modelId || "(none)"}.`,
    `Bots: ${capacity.bots}/${capacity.maxBots}. Running: ${capacity.running}/${capacity.maxConcurrentAgents}.`,
    `Computers: ${capacity.computer.isolated} isolated, ${capacity.computer.live} live, ${capacity.computer.inProcess} in-process. Supervisor: ${capacity.computer.supervisor ? "yes" : "no"}. Shared computer: ${capacity.computer.sharedComputer ? "yes" : "no"}.`,
    computerCapacityNote(capacity),
    "If you cannot spawn, say the reason from the tool result. Never pretend a bot exists.",
  ].join("\n");
}

export type HouseAction = "spawn" | "stop" | "delete" | "restore";

export type HouseActionDecisionCode = "ok" | "house_management_off" | "leader_forbidden";

export type HouseActionDecision = {
  allowed: boolean;
  code: HouseActionDecisionCode;
  reason: string;
};

export function isHouseWideTarget(raw: string) {
  const needle = raw.trim().toLowerCase();
  return needle === "all" || needle === "others" || needle === "*" || needle === "everyone";
}

export function isLeaderbotSelfTarget(input: {
  leaderId?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  targetKind?: string | null;
}) {
  if (input.targetId && input.leaderId && input.targetId === input.leaderId) return true;
  if (input.targetKind === LEADERBOT_KIND) return true;
  return isLeaderbotName(input.targetName);
}

export function decideHouseAction(input: {
  enabled: boolean;
  action: HouseAction;
  targetIsLeader?: boolean;
}): HouseActionDecision {
  if (!input.enabled) {
    return {
      allowed: false,
      code: "house_management_off",
      reason:
        "House management is off. Enable “Leaderbot can add, stop, and delete coworkers” in OpenBot settings.",
    };
  }
  if ((input.action === "stop" || input.action === "delete") && input.targetIsLeader) {
    return {
      allowed: false,
      code: "leader_forbidden",
      reason:
        input.action === "delete"
          ? "Leaderbot cannot delete itself. Delete coworkers only."
          : "Leaderbot cannot stop itself. Stop a coworker instead.",
    };
  }
  return { allowed: true, code: "ok", reason: "ok" };
}
