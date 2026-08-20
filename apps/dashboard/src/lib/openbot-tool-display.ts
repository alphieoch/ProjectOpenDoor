import { formatRagSearchDisplay, isSearchToolName } from "@opendoor/shared";
import { isOpenBotStatusBanner } from "./openbot-house";
import { LEADERBOT_TOOL_NAMES, isLeaderbotName } from "./openbot-leader";

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LIVE_NOISE_RE = /gateway\s+\d+\s*ms|\b\d+\s+models\b|isolated Chromium|shared Chromium|in-process computer/i;

export type HouseToolRole = "leader" | "coworker";
export type HouseAgentStatusLabel = "Ready" | "Running" | "Stopped";
export type HouseMutationAction = "delete" | "stop" | "spawn" | "restore";
export type HouseSpawnMode = "started" | "online" | "reused";

export type HouseToolCoworkerInput = {
  id: string;
  name: string;
  role?: string | null;
  kind?: string | null;
  status?: string | null;
  statusMessage?: string | null;
  lastMessage?: string | null;
  model?: string | null;
  modelId?: string | null;
};

export type HouseToolCoworker = {
  id: string;
  name: string;
  role: HouseToolRole;
  status: string;
  model?: string;
};

export type HouseMutationOutcome = {
  ok: boolean;
  id?: string;
  name: string;
  reason?: string;
  mode?: HouseSpawnMode;
};

export type HouseToolPayload = {
  display: string;
  result: string;
  coworkers?: HouseToolCoworker[];
  ok?: boolean;
};

const HOUSE_TOOL_LABELS: Record<string, string> = {
  list_coworkers: "List coworkers",
  inspect_resources: "Check capacity",
  spawn_coworker: "Start coworker",
  stop_coworker: "Pause coworker",
  delete_coworker: "Remove coworker",
  restore_coworker: "Restore coworker",
  web_search: "Search",
};

export function isHouseToolName(name: string | null | undefined) {
  return (LEADERBOT_TOOL_NAMES as readonly string[]).includes((name || "").trim());
}

export function houseToolLabel(name: string | null | undefined) {
  const key = (name || "").trim();
  if (HOUSE_TOOL_LABELS[key]) return HOUSE_TOOL_LABELS[key];
  if (!key) return "Tool";
  return key.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase());
}

export function houseAgentStatusLabel(status?: string | null): HouseAgentStatusLabel {
  const value = (status || "").trim().toLowerCase();
  if (value === "running" || value === "starting") return "Running";
  if (value === "stopped" || value === "stopping" || value === "failed") return "Stopped";
  return "Ready";
}

export function joinHumanNames(names: string[]) {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0]!;
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

export function stripToolIds(text: string) {
  return text
    .replace(UUID_RE, "")
    .replace(/\bid=\S+/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function coworkerRole(bot: HouseToolCoworkerInput, leaderId?: string | null): HouseToolRole {
  if (bot.role === "leader" || bot.kind === "leader") return "leader";
  if (leaderId && bot.id === leaderId) return "leader";
  if (isLeaderbotName(bot.name)) return "leader";
  return "coworker";
}

function coworkerModel(bot: HouseToolCoworkerInput) {
  return (bot.model || bot.modelId || "").trim();
}

export function toHouseToolCoworker(bot: HouseToolCoworkerInput, leaderId?: string | null): HouseToolCoworker {
  const model = coworkerModel(bot);
  return {
    id: bot.id,
    name: bot.name,
    role: coworkerRole(bot, leaderId),
    status: (bot.status || "ready").trim() || "ready",
    ...(model ? { model } : {}),
  };
}

export function formatCoworkerListLine(
  bot: HouseToolCoworker,
  opts?: { leaderId?: string | null },
) {
  const you = Boolean(opts?.leaderId && bot.id === opts.leaderId) || bot.role === "leader";
  const role = bot.role === "leader" && you ? "leader (you)" : bot.role;
  const parts = [bot.name, role, houseAgentStatusLabel(bot.status)];
  if (bot.model) parts.push(bot.model);
  return `${parts[0]} — ${parts.slice(1).join(" · ")}`;
}

export function formatListCoworkersResult(input: {
  coworkers: HouseToolCoworkerInput[];
  leaderId?: string | null;
}): HouseToolPayload {
  const coworkers = input.coworkers.map((bot) => toHouseToolCoworker(bot, input.leaderId));
  const display =
    coworkers.length === 0
      ? "No OpenBot coworkers in this house yet."
      : coworkers.map((bot) => formatCoworkerListLine(bot, { leaderId: input.leaderId })).join("\n");
  const payload = { coworkers, display };
  return { display, result: JSON.stringify(payload), coworkers };
}

function parseToolPayload(content: string): { display?: string } | null {
  const raw = content.trim();
  if (!raw.startsWith("{")) return null;
  try {
    const value = JSON.parse(raw) as { display?: unknown };
    if (value && typeof value.display === "string" && value.display.trim()) {
      return { display: value.display };
    }
  } catch {
    return null;
  }
  return null;
}

function parseLegacyListLine(line: string): HouseToolCoworkerInput | null {
  const trimmed = line.replace(/^[-*]\s*/, "").trim();
  const match = trimmed.match(
    /^(.+?)\s+\((leader|coworker)(?:,\s*you)?\)(?:\s+id=\S+)?(?:\s+status=(\S+))?(?:\s+model=(\S+))?/i,
  );
  if (!match) return null;
  return {
    id: "",
    name: match[1]!.trim(),
    role: match[2]!.toLowerCase(),
    status: match[3],
    model: match[4],
  };
}

function recoverListDisplay(content: string, leaderId?: string | null) {
  const bots = content
    .split("\n")
    .map(parseLegacyListLine)
    .filter((bot): bot is HouseToolCoworkerInput => Boolean(bot));
  if (bots.length === 0) return null;
  return formatListCoworkersResult({ coworkers: bots, leaderId }).display;
}

function rewriteLegacyMutation(content: string) {
  const removed: string[] = [];
  const paused: string[] = [];
  const other: string[] = [];
  for (const raw of content.split("\n")) {
    const line = stripToolIds(raw).trim();
    if (!line) continue;
    const deleted = line.match(/^Deleted\s+(.+?)\.\s*Recoverable/i);
    if (deleted) {
      removed.push(deleted[1]!.replace(/\.$/, "").trim());
      continue;
    }
    const stopped = line.match(/^Stopped\s+(.+?)\.(?:\s+Already paused;)?/i);
    if (stopped) {
      paused.push(stopped[1]!.replace(/\.$/, "").replace(/\s+Already paused.*$/i, "").trim());
      continue;
    }
    other.push(line);
  }
  const parts: string[] = [];
  if (removed.length) {
    parts.push(`Removed ${joinHumanNames(removed)}. Recoverable for 7 days in OpenBot settings.`);
  }
  if (paused.length) {
    parts.push(`Paused ${joinHumanNames(paused)}. Chat and memory are kept.`);
  }
  parts.push(...other);
  return parts.join(" ").trim();
}

function hideLiveNoise(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const withoutBanner = line.split(" — ").filter((part) => !isOpenBotStatusBanner(part) && !LIVE_NOISE_RE.test(part));
      return withoutBanner.join(" — ").replace(/\s+computer=\S+/gi, "").trim();
    })
    .filter((line) => line && !isOpenBotStatusBanner(line) && !LIVE_NOISE_RE.test(line))
    .join("\n");
}

export function houseToolThreadContent(name: string | null | undefined, content: string) {
  if (isSearchToolName(name)) {
    return formatRagSearchDisplay(content);
  }
  const parsed = parseToolPayload(content);
  if (parsed?.display) return stripToolIds(parsed.display);

  if (name === "list_coworkers") {
    const recovered = recoverListDisplay(content);
    if (recovered) return recovered;
  }
  if (name === "delete_coworker" || name === "stop_coworker") {
    const rewritten = rewriteLegacyMutation(content);
    if (rewritten) return rewritten;
  }

  return stripToolIds(hideLiveNoise(content));
}

export function formatHouseMutationResult(input: {
  action: HouseMutationAction;
  outcomes: HouseMutationOutcome[];
}): HouseToolPayload {
  const succeeded = input.outcomes.filter((row) => row.ok);
  const failed = input.outcomes.filter((row) => !row.ok);
  const names = succeeded.map((row) => row.name);
  const parts: string[] = [];

  if (input.action === "delete" && names.length) {
    parts.push(`Removed ${joinHumanNames(names)}. Recoverable for 7 days in OpenBot settings.`);
  } else if (input.action === "stop" && names.length) {
    parts.push(`Paused ${joinHumanNames(names)}. Chat and memory are kept.`);
  } else if (input.action === "restore" && names.length) {
    parts.push(`Restored ${joinHumanNames(names)}. Start it again to attach the computer.`);
  } else if (input.action === "spawn" && succeeded[0]) {
    const row = succeeded[0];
    if (row.mode === "reused") parts.push(`${row.name} is already running.`);
    else if (row.mode === "online") parts.push(`Brought ${row.name} online.`);
    else parts.push(`Started ${row.name}.`);
  }

  for (const row of failed) {
    const reason = (row.reason || "could not complete.").trim();
    parts.push(reason.toLowerCase().startsWith(row.name.toLowerCase()) ? reason : `${row.name}: ${reason}`);
  }

  const display = stripToolIds(parts.join(" ") || "Nothing changed.");
  const payload = {
    action: input.action,
    display,
    changed: succeeded.map((row) => ({ id: row.id, name: row.name })),
    failed: failed.map((row) => ({ id: row.id, name: row.name, reason: row.reason })),
  };
  return { display, result: JSON.stringify(payload), ok: succeeded.length > 0 };
}

export function formatSpawnCoworkerResult(input: {
  id: string;
  name: string;
  status: string;
  mode: HouseSpawnMode;
  assignedReply?: string;
  warning?: string;
}): HouseToolPayload {
  const formatted = formatHouseMutationResult({
    action: "spawn",
    outcomes: [{ ok: true, id: input.id, name: input.name, mode: input.mode }],
  });
  const payload = {
    coworker: { id: input.id, name: input.name, role: "coworker" as const, status: input.status },
    display: formatted.display,
    assignedReply: input.assignedReply || undefined,
    warning: input.warning || undefined,
  };
  return { display: formatted.display, result: JSON.stringify(payload), ok: true };
}
