import type { AgentSkill } from "./agent-workspace.js";

export const OPENBOT_SKILL_PATH_SEGMENTS = ["skills", "agents"] as const;

export function isOpenBotReservedPathSegment(segment?: string | null): boolean {
  return (OPENBOT_SKILL_PATH_SEGMENTS as readonly string[]).includes(segment ?? "");
}

export type OpenBotCatalogSkill = {
  id: string;
  title: string;
  description: string;
  helpsWith: string;
  body: string;
  seed?: boolean;
};

export const OPENBOT_SKILL_CATALOG: OpenBotCatalogSkill[] = [
  {
    id: "browse-and-report",
    title: "Browse and report",
    description: "Open public pages, read them, and bring back a short report.",
    helpsWith: "Web research without guessing what a site says",
    body: "Open public https pages with computer_navigate, then computer_read. To act, computer_screenshot then computer_click with visible text (cookie consent) or a snapshot ref. x,y is the fallback in screenshot CSS pixels. computer_wait after each click.",
    seed: true,
  },
  {
    id: "decide-then-act",
    title: "Decide, then act",
    description: "Let the gateway audit computer actions, and stop at login or captcha walls.",
    helpsWith: "Safe clicks and knowing when to ask a person",
    body: "The gateway decides and audits every computer action before it runs. If the snapshot looks like a login, 2FA, or captcha wall, call request_help.",
    seed: true,
  },
  {
    id: "workspace-files",
    title: "Workspace files",
    description: "Write durable notes under /workspace and read them before repeating work.",
    helpsWith: "Keeping research, drafts, and runbooks the coworker can reuse",
    body: "Keep durable notes under /workspace with computer_write_file. Read them back with computer_read_file before repeating work.",
    seed: true,
  },
  {
    id: "cite-sources",
    title: "Cite sources",
    description: "Name the pages a claim came from, with a short excerpt and URL.",
    helpsWith: "Answers the person can check",
    body: "When you use computer_navigate or computer_read, keep the page URL and a short excerpt for every fact you will state. Answer with the claim, then the source URL. Prefer render_component kind=links titled “Sources”. Do not invent citations. If you could not open the page, say so and request_help only if a person must sign in.",
  },
  {
    id: "extract-tables",
    title: "Extract tables",
    description: "Pull tabular data off a page into a structured card or a workspace file.",
    helpsWith: "Pricing grids, rosters, and other rows-and-columns pages",
    body: "When the user wants a table, computer_read the current page (computer_navigate first if they named a URL). Reconstruct rows faithfully. Answer with render_component kind=table. If they want it kept, computer_write_file a CSV under /workspace/tables/. Do not invent cells you did not see. If the table is behind a login, call request_help.",
  },
  {
    id: "draft-email",
    title: "Draft email",
    description: "Write a send-ready email and save it, without pretending it was sent.",
    helpsWith: "Outreach, replies, and recap messages",
    body: "Draft a complete email: suggested To, Subject, and body in the user’s voice. Confirm recipient and tone if those are missing. computer_write_file the draft under /workspace/drafts/. Never claim the email was sent. If they asked you to look someone up first, browse-and-report then cite-sources before drafting.",
  },
  {
    id: "check-metrics",
    title: "Check metrics",
    description: "Read numbers from a page or workspace notes and show them as a metric card.",
    helpsWith: "Dashboards, usage, and “what is the number” questions",
    body: "For a metrics question, read the named page or /workspace notes before answering. Use render_component kind=metric with the figure and the unit. Quote the source (URL or file path). If the number is missing or stale, say so and ask where to look. Do not invent figures. If the dashboard needs a login, call request_help.",
  },
  {
    id: "follow-runbook",
    title: "Follow a runbook",
    description: "Walk a known procedure in order, snapshotting before each click.",
    helpsWith: "Repeating a checklist the workspace already has",
    body: "If a runbook lives under /workspace, computer_read_file it first. If the user pasted steps, follow those. Execute in order. computer_snapshot before every computer_click or computer_type. After each step, confirm the page still matches the runbook. Stop and call request_help on login, 2FA, captcha, or an ambiguous step. Write a short outcome note with computer_write_file when the run finishes.",
  },
  {
    id: "screenshot-report",
    title: "Screenshot report",
    description: "Capture the current screen and write what is visible plus a next step.",
    helpsWith: "Showing what the computer sees when words are not enough",
    body: "Call computer_screenshot on the current page, then computer_read. Write a short report: what is on screen, notable text, and one recommended next step. If they want it kept, computer_write_file under /workspace/reports/. Do not click or type unless they asked you to act after the report.",
  },
];

export function getOpenBotCatalogSkill(id: string): OpenBotCatalogSkill | undefined {
  const needle = id.trim().toLowerCase();
  return OPENBOT_SKILL_CATALOG.find((item) => item.id === needle);
}

export function openBotSeedSkills(now = new Date().toISOString()): AgentSkill[] {
  return OPENBOT_SKILL_CATALOG.filter((item) => item.seed).map((item) => catalogSkillToAgent(item, now));
}

export function catalogSkillToAgent(item: OpenBotCatalogSkill, now = new Date().toISOString()): AgentSkill {
  return {
    id: crypto.randomUUID(),
    name: item.id,
    body: item.body,
    source: "seed",
    createdAt: now,
  };
}

export function hasSkillNamed(skills: Array<{ name: string }>, name: string) {
  const needle = name.trim().toLowerCase();
  return skills.some((skill) => skill.name.toLowerCase() === needle);
}

export function skillSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function parseCustomSkillDraft(input: {
  name?: unknown;
  description?: unknown;
  instructions?: unknown;
}): { ok: true; name: string; body: string } | { ok: false; error: string } {
  const rawName = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const instructions = typeof input.instructions === "string" ? input.instructions.trim() : "";
  if (rawName.length < 2 || rawName.length > 80) {
    return { ok: false, error: "Name must be between 2 and 80 characters." };
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _./-]{0,79}$/.test(rawName)) {
    return { ok: false, error: "Name can use letters, numbers, spaces, dots, slashes, and hyphens." };
  }
  if (instructions.length < 10) {
    return { ok: false, error: "Instructions need at least 10 characters so the coworker knows what to do." };
  }
  if (instructions.length > 4000) {
    return { ok: false, error: "Instructions must be 4000 characters or fewer." };
  }
  if (description.length > 240) {
    return { ok: false, error: "Description must be 240 characters or fewer." };
  }
  const name = skillSlug(rawName);
  if (name.length < 2) {
    return { ok: false, error: "Name must include letters or numbers." };
  }
  const body = description ? `${description}\n\n${instructions}` : instructions;
  return { ok: true, name, body: body.slice(0, 4000) };
}

export function enableCatalogSkill(
  skills: AgentSkill[],
  catalogId: string,
  now = new Date().toISOString(),
): { skills: AgentSkill[]; added: boolean; skill?: AgentSkill; error?: string } {
  const item = getOpenBotCatalogSkill(catalogId);
  if (!item) return { skills, added: false, error: `Unknown skill "${catalogId}"` };
  const existing = skills.find((skill) => skill.name.toLowerCase() === item.id);
  if (existing) return { skills, added: false, skill: existing };
  const skill = catalogSkillToAgent(item, now);
  return { skills: [...skills, skill], added: true, skill };
}

export function authorSkillOnWorkspace(
  skills: AgentSkill[],
  draft: { name?: unknown; description?: unknown; instructions?: unknown },
  now = new Date().toISOString(),
): { skills: AgentSkill[]; added: boolean; skill?: AgentSkill; error?: string } {
  const parsed = parseCustomSkillDraft(draft);
  if (!parsed.ok) return { skills, added: false, error: parsed.error };
  const skill: AgentSkill = {
    id: crypto.randomUUID(),
    name: parsed.name,
    body: parsed.body,
    source: "authored",
    createdAt: now,
  };
  const existing = skills.findIndex((row) => row.name.toLowerCase() === skill.name);
  if (existing >= 0) {
    const next = skills.slice();
    next[existing] = { ...skill, id: skills[existing]!.id, createdAt: skills[existing]!.createdAt };
    return { skills: next, added: false, skill: next[existing] };
  }
  return { skills: [...skills, skill], added: true, skill };
}

export function resolveOpenBotSkillTarget<
  T extends { id: string; name?: string | null; kind?: string | null; workspace?: { kind?: string | null } | null },
>(agents: T[], activeId?: string | null): T | undefined {
  const reserved = new Set<string>(OPENBOT_SKILL_PATH_SEGMENTS);
  if (activeId && !reserved.has(activeId)) {
    const active = agents.find((agent) => agent.id === activeId);
    if (active) return active;
  }
  const leader = agents.find((agent) => {
    if (agent.kind === "leader" || agent.workspace?.kind === "leader") return true;
    return (agent.name || "").trim().toLowerCase() === "leaderbot";
  });
  if (leader) return leader;
  return agents.length === 1 ? agents[0] : undefined;
}
