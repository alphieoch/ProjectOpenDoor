import type { AgentRuntimeId } from "@/lib/agents/runtimes";

export type AgentMemoryItem = {
  id: string;
  kind: "working" | "episodic" | "semantic" | "note";
  content: string;
  createdAt: string;
};

export type AgentSkill = {
  id: string;
  name: string;
  body: string;
  source: "seed" | "authored";
  createdAt: string;
};

export type AgentOutboxItem = {
  id: string;
  channel: string;
  recipient: string;
  body: string;
  createdAt: string;
};

export type AgentAuditItem = {
  id: string;
  action: string;
  detail: string;
  allowed: boolean;
  createdAt: string;
};

export type AgentProbe = {
  ok: boolean;
  latencyMs: number;
  at: string;
  error?: string;
  modelsSeen?: number;
};

export type AgentWorkspace = {
  memory: AgentMemoryItem[];
  skills: AgentSkill[];
  outbox: AgentOutboxItem[];
  audit: AgentAuditItem[];
  probe?: AgentProbe;
};

export function emptyWorkspace(): AgentWorkspace {
  return { memory: [], skills: [], outbox: [], audit: [] };
}

export function readWorkspace(config: unknown): AgentWorkspace {
  const raw = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  return {
    memory: Array.isArray(raw.memory) ? (raw.memory as AgentMemoryItem[]) : [],
    skills: Array.isArray(raw.skills) ? (raw.skills as AgentSkill[]) : [],
    outbox: Array.isArray(raw.outbox) ? (raw.outbox as AgentOutboxItem[]) : [],
    audit: Array.isArray(raw.audit) ? (raw.audit as AgentAuditItem[]) : [],
    probe: raw.probe && typeof raw.probe === "object" ? (raw.probe as AgentProbe) : undefined,
  };
}

export function seedSkills(runtime: AgentRuntimeId): AgentSkill[] {
  const now = new Date().toISOString();
  if (runtime === "hermes") {
    return [
      {
        id: crypto.randomUUID(),
        name: "remember-preference",
        body: "When the user states a lasting preference, call write_memory with kind=semantic.",
        source: "seed",
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        name: "distill-skill",
        body: "After a repeated procedure works, call author_skill so the next run is shorter.",
        source: "seed",
        createdAt: now,
      },
    ];
  }
  if (runtime === "nemoclaw") {
    return [
      {
        id: crypto.randomUUID(),
        name: "policy-gate",
        body: "Call policy_check before any outbound or compute action. Refuse if it is denied.",
        source: "seed",
        createdAt: now,
      },
    ];
  }
  return [
    {
      id: crypto.randomUUID(),
      name: "channel-reply",
      body: "When the user wants a message sent, call route_channel with channel=web unless they name another channel.",
      source: "seed",
      createdAt: now,
    },
  ];
}

export function workspacePublic(ws: AgentWorkspace) {
  return {
    memory: ws.memory.slice(-20),
    skills: ws.skills.map((s) => ({ id: s.id, name: s.name, source: s.source, createdAt: s.createdAt })),
    outbox: ws.outbox.slice(-20),
    audit: ws.audit.slice(-20),
    probe: ws.probe || null,
    counts: {
      memory: ws.memory.length,
      skills: ws.skills.length,
      outbox: ws.outbox.length,
    },
  };
}
