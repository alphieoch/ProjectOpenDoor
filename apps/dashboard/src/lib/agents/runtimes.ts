export const AGENT_RUNTIMES = ["openclaw", "hermes", "nemoclaw"] as const;

export type AgentRuntimeId = (typeof AGENT_RUNTIMES)[number];

export type AgentRuntime = {
  id: AgentRuntimeId;
  name: string;
  maker: string;
  tagline: string;
  description: string;
  strengths: string[];
  defaultPrompt: string;
};

export const AGENT_RUNTIME_CATALOG: AgentRuntime[] = [
  {
    id: "openclaw",
    name: "OpenClaw",
    maker: "OpenClaw Foundation",
    tagline: "Multi-channel gateway agent",
    description:
      "A control-plane agent that lives across Slack, Discord, Telegram, and WhatsApp. Best when you want one assistant routed to the places your team already chats.",
    strengths: ["Channels", "Skills marketplace", "Multi-agent routing"],
    defaultPrompt:
      "You are the hosted OpenClaw runtime on OpenDoor. Use route_channel to queue outbound messages, use_skill for installed skills, fetch_public_url for public pages, and remember/recall for workspace notes. Keep steps inspectable.",
  },
  {
    id: "hermes",
    name: "Hermes",
    maker: "Nous Research",
    tagline: "Self-improving runtime",
    description:
      "A single persistent agent with procedural memory. Best when you want one specialist that gets sharper at recurring work over time.",
    strengths: ["Memory", "Skill authoring", "Long-horizon tasks"],
    defaultPrompt:
      "You are the hosted Hermes runtime on OpenDoor. Write memory after useful facts, author_skill after a procedure works twice, and recall before repeating work. Stay on the user's long-running goals.",
  },
  {
    id: "nemoclaw",
    name: "NemoClaw",
    maker: "NVIDIA",
    tagline: "Hardened OpenClaw for production",
    description:
      "NVIDIA's sandboxed OpenClaw stack. Same gateway-style agent, with a tighter execution sandbox for teams that need a more locked-down runtime.",
    strengths: ["Sandbox", "Enterprise controls", "NIM-ready"],
    defaultPrompt:
      "You are the hosted NemoClaw runtime on OpenDoor. Call policy_check before risky actions, use sandbox_eval for calc/json only, and audit_log attributable work. Refuse shell, credentials, and private-network access.",
  },
];

export function isAgentRuntime(value: unknown): value is AgentRuntimeId {
  return typeof value === "string" && (AGENT_RUNTIMES as readonly string[]).includes(value);
}

export function getAgentRuntime(id: string): AgentRuntime | undefined {
  return AGENT_RUNTIME_CATALOG.find((r) => r.id === id);
}

export function toAgentSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
