import {
  emptyComputer,
  readComputer,
  type AgentComputer,
  type OpenBotAuditOutcome,
} from "@opendoor/shared";
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
  rule?: string;
  outcome?: OpenBotAuditOutcome;
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
  computer: AgentComputer;
  probe?: AgentProbe;
};

export function emptyWorkspace(): AgentWorkspace {
  return { memory: [], skills: [], outbox: [], audit: [], computer: emptyComputer() };
}

export function readWorkspace(config: unknown): AgentWorkspace {
  const raw = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  return {
    memory: Array.isArray(raw.memory) ? (raw.memory as AgentMemoryItem[]) : [],
    skills: Array.isArray(raw.skills) ? (raw.skills as AgentSkill[]) : [],
    outbox: Array.isArray(raw.outbox) ? (raw.outbox as AgentOutboxItem[]) : [],
    audit: Array.isArray(raw.audit) ? (raw.audit as AgentAuditItem[]) : [],
    computer: readComputer(raw.computer),
    probe: raw.probe && typeof raw.probe === "object" ? (raw.probe as AgentProbe) : undefined,
  };
}

export function seedSkills(runtime: AgentRuntimeId): AgentSkill[] {
  const now = new Date().toISOString();
  if (runtime === "openbot") {
    return [
      {
        id: crypto.randomUUID(),
        name: "browse-and-report",
        body: "Open public https pages with computer_navigate, then computer_read_page before answering. Follow a visible link with computer_follow_link instead of guessing URLs.",
        source: "seed",
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        name: "decide-then-act",
        body: "The gateway decides and audits every computer action before it runs. If the snapshot looks like a login, 2FA, or captcha wall, call request_help.",
        source: "seed",
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        name: "workspace-files",
        body: "Keep durable notes under /workspace with computer_write_file. Read them back with computer_read_file before repeating work.",
        source: "seed",
        createdAt: now,
      },
    ];
  }
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
  const computer = readComputer(ws.computer);
  return {
    memory: ws.memory.slice(-20),
    skills: ws.skills.map((s) => ({ id: s.id, name: s.name, source: s.source, createdAt: s.createdAt })),
    outbox: ws.outbox.slice(-20),
    audit: ws.audit.slice(-20),
    computer: {
      operator: computer.operator,
      status: computer.status,
      helpReason: computer.helpReason,
      url: computer.url,
      title: computer.title,
      excerpt: computer.excerpt.slice(0, 1200),
      links: computer.links.slice(0, 12),
      history: computer.history.slice(-8),
      files: computer.files.map((f) => ({ path: f.path, updatedAt: f.updatedAt, bytes: f.content.length })),
      components: computer.components.slice(-8),
    },
    probe: ws.probe || null,
    counts: {
      memory: ws.memory.length,
      skills: ws.skills.length,
      outbox: ws.outbox.length,
      files: computer.files.length,
      audit: ws.audit.length,
    },
  };
}
