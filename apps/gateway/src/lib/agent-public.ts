import { AGENT_SOFT_DELETE_RETENTION_MS, agentPurgeAt, daysLeftToRecover, getPlan } from "@opendoor/shared";

export const AGENT_PUBLIC_ROUTES = [
  { method: "GET", path: "/v1/agents", group: "agents", summary: "List workspace agents" },
  { method: "POST", path: "/v1/agents", group: "agents", summary: "Create and boot a coworker, OpenBot, or Leaderbot" },
  { method: "GET", path: "/v1/agents/:id", group: "agents", summary: "Get an agent and recent messages" },
  { method: "PATCH", path: "/v1/agents/:id", group: "agents", summary: "Start, stop, or take the wheel" },
  { method: "POST", path: "/v1/agents/:id/chat", group: "agents", summary: "Run an agent turn, including OpenBot computer tools" },
  { method: "POST", path: "/v1/agents/:id/ag-ui", group: "agents", summary: "AG-UI stream for an OpenBot / hosted agent turn" },
  { method: "POST", path: "/v1/agents/:id/restore", group: "agents", summary: "Restore a soft-deleted agent within 7 days" },
  { method: "DELETE", path: "/v1/agents/:id", group: "agents", summary: "Soft-delete an agent (7-day recovery)" },
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAgentId(id: string) {
  return UUID_RE.test(id);
}

export function isLeaderbotName(name: string | null | undefined) {
  return (name || "").trim().toLowerCase() === "leaderbot";
}

export function isLeaderbotRecord(row: { name?: string | null; config?: unknown }) {
  const kind =
    row.config && typeof row.config === "object" && "kind" in row.config
      ? (row.config as { kind?: unknown }).kind
      : undefined;
  return kind === "leader" || isLeaderbotName(row.name);
}

export function resolveCreateKind(name: string, kind: unknown): "leader" | "coworker" | undefined {
  if (kind === "leader" || isLeaderbotName(name)) return "leader";
  if (kind === "coworker") return "coworker";
  return undefined;
}

export function agentKind(row: {
  name?: string | null;
  runtime?: string | null;
  config?: unknown;
}): "leader" | "coworker" | null {
  const raw = row.config && typeof row.config === "object" ? (row.config as { kind?: unknown }).kind : undefined;
  if (raw === "leader" || isLeaderbotName(row.name)) return "leader";
  if (raw === "coworker") return "coworker";
  if (row.runtime === "openbot") return "coworker";
  return null;
}

export function planAgentCaps(plan: string | null | undefined) {
  const def = getPlan(plan);
  return {
    plan: def.id,
    maxBots: def.maxApiKeys,
    maxConcurrentAgents: def.maxActiveDeployments,
  };
}

export type AgentCapSnapshot = ReturnType<typeof planAgentCaps> & {
  bots: number;
  running: number;
};

export function spawnCapError(input: {
  action: "create" | "start";
  bots: number;
  running: number;
  plan: string | null | undefined;
}): { error: string; code: "at_bot_cap" | "at_concurrent_cap"; capacity: AgentCapSnapshot } | null {
  const caps = planAgentCaps(input.plan);
  const capacity = { ...caps, bots: input.bots, running: input.running };
  if (input.action === "create" && input.bots >= caps.maxBots) {
    return {
      error: `This ${caps.plan} plan allows ${caps.maxBots} agent keys. Stop or delete a bot before creating another.`,
      code: "at_bot_cap",
      capacity,
    };
  }
  if ((input.action === "create" || input.action === "start") && input.running >= caps.maxConcurrentAgents) {
    return {
      error: `This ${caps.plan} plan allows ${caps.maxConcurrentAgents} concurrent running agents. Stop one before bringing another online.`,
      code: "at_concurrent_cap",
      capacity,
    };
  }
  return null;
}

export function presentDeletedAgent(row: { id: string; name: string; deletedAt: Date | null }) {
  if (!row.deletedAt) return null;
  return {
    id: row.id,
    name: row.name,
    deletedAt: row.deletedAt,
    daysLeft: daysLeftToRecover(row.deletedAt),
    recoverUntil: agentPurgeAt(row.deletedAt).toISOString(),
    recoverWindowMs: AGENT_SOFT_DELETE_RETENTION_MS,
  };
}
