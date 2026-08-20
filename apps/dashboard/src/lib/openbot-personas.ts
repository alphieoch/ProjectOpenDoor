import { OPENBOT_SYSTEM_PROMPT } from "@opendoor/shared";
import { LEADERBOT_ID, LEADERBOT_NAME, leaderbotSystemPrompt } from "./openbot-leader";

export type OpenBotPersonaId = "leader" | "general" | "research" | "knowledge" | "metrics";

export type OpenBotPersona = {
  id: OpenBotPersonaId;
  name: string;
  avatarSeed: string;
  roleDescription: string;
  systemPrompt: string;
};

export function openBotCoworkerPrompt(name: string, role: string) {
  return `${OPENBOT_SYSTEM_PROMPT} You are ${name}. ${role}`;
}

function withRole(name: string, role: string) {
  return openBotCoworkerPrompt(name, role);
}

export const LEADERBOT_PERSONA: OpenBotPersona = {
  id: LEADERBOT_ID,
  name: LEADERBOT_NAME,
  avatarSeed: "leaderbot",
  roleDescription: "Orchestrates coworkers: add, stop, and delete specialists within plan limits.",
  systemPrompt: leaderbotSystemPrompt(),
};

export const OPENBOT_PERSONAS: OpenBotPersona[] = [
  {
    id: "general",
    name: "General Assistant",
    avatarSeed: "general-assistant",
    roleDescription: "Help with everyday work using clear, concise, and accurate answers.",
    systemPrompt: withRole(
      "General Assistant",
      "Help with everyday work. Be clear, concise, and accurate.",
    ),
  },
  {
    id: "research",
    name: "Research",
    avatarSeed: "research",
    roleDescription: "Gathers context from documents, drafts from it.",
    systemPrompt: withRole(
      "Research",
      "Gather context from documents and the public web, then draft from what you found.",
    ),
  },
  {
    id: "knowledge",
    name: "Knowledge",
    avatarSeed: "knowledge",
    roleDescription: "Answers from company documents, with sources.",
    systemPrompt: withRole(
      "Knowledge",
      "Answer from company documents and cite sources when you have them.",
    ),
  },
  {
    id: "metrics",
    name: "Metrics",
    avatarSeed: "metrics",
    roleDescription: "Reads the warehouse and draws the answer.",
    systemPrompt: withRole(
      "Metrics",
      "Read numbers and draw the answer. Prefer concrete figures over vague summaries.",
    ),
  },
];

export const DEFAULT_OPENBOT_PERSONA = OPENBOT_PERSONAS[0]!;

export const OPENBOT_ROSTER: OpenBotPersona[] = [LEADERBOT_PERSONA, ...OPENBOT_PERSONAS];

export function getOpenBotPersona(id: string) {
  return OPENBOT_ROSTER.find((persona) => persona.id === id) ?? DEFAULT_OPENBOT_PERSONA;
}

export function findOpenBotPersonaByName(name: string) {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return OPENBOT_ROSTER.find(
    (persona) =>
      persona.name.toLowerCase() === needle ||
      persona.name.toLowerCase().startsWith(needle) ||
      persona.id === needle,
  );
}

export function parseComposerAsk(text: string): { persona: OpenBotPersona; message: string } {
  const trimmed = text.trim();
  if (trimmed.startsWith("@")) {
    const rest = trimmed.slice(1);
    const lower = rest.toLowerCase();
    const ranked = [...OPENBOT_ROSTER].sort((a, b) => b.name.length - a.name.length);
    for (const persona of ranked) {
      const name = persona.name.toLowerCase();
      if (lower === name || lower.startsWith(`${name} `)) {
        return { persona, message: rest.slice(persona.name.length).trim() };
      }
      if (lower === persona.id || lower.startsWith(`${persona.id} `)) {
        return { persona, message: rest.slice(persona.id.length).trim() };
      }
    }
  }
  return { persona: DEFAULT_OPENBOT_PERSONA, message: trimmed };
}

export function matchingChannels<T extends { name: string; lastMessage?: string | null }>(
  channels: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return channels;
  return channels.filter((channel) =>
    [channel.name, channel.lastMessage].some((field) => field?.toLowerCase().includes(needle)),
  );
}

export function formatChannelTime(iso: string | Date | null | undefined) {
  if (!iso) return "";
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function snippet(text: string | null | undefined, max = 42) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "YO";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] || ""}${parts[1]![0] || ""}`.toUpperCase();
}
