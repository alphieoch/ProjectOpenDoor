import {
  findExistingLeaderbot,
  isLeaderbotChannel,
  pinLeaderbotFirst,
  type LeaderbotIdentity,
} from "./openbot-leader";

export type HouseComputer = {
  backend?: string | null;
  isolation?: { mode?: string | null } | null;
  status?: string | null;
};

export type HouseMember = LeaderbotIdentity & {
  id: string;
  name: string;
  runtime?: string | null;
  status?: string | null;
  statusMessage?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  modelId?: string | null;
  workspace?: LeaderbotIdentity["workspace"] & { computer?: HouseComputer | null };
};

export type OpenBotHouseView<T extends HouseMember> = {
  leader: T | null;
  members: T[];
  bots: T[];
  status: HouseStatus;
};

export type HouseStatus = {
  runtimeName: "OpenBot";
  modelId: string;
  computer: string;
  running: number;
  total: number;
  line: string;
};

const LIVE_BANNER = /is live on /i;
const BOOTING_BANNER = /^booting /i;

export function isOpenBotRuntime(runtime: string | null | undefined) {
  return (runtime || "").trim().toLowerCase() === "openbot";
}

export function partitionAgentRuntimes<T extends { runtime?: string | null }>(agents: T[]) {
  const house: T[] = [];
  const others: T[] = [];
  for (const agent of agents) {
    if (isOpenBotRuntime(agent.runtime)) house.push(agent);
    else others.push(agent);
  }
  return { house: pinLeaderbotFirst(house), others };
}

export function isOpenBotStatusBanner(text: string | null | undefined) {
  const value = (text || "").trim();
  if (!value) return false;
  return LIVE_BANNER.test(value) || BOOTING_BANNER.test(value);
}

export function houseChannelPreview(
  lastMessage?: string | null,
  statusMessage?: string | null,
) {
  if (lastMessage && !isOpenBotStatusBanner(lastMessage)) return lastMessage;
  if (statusMessage && !isOpenBotStatusBanner(statusMessage)) return statusMessage;
  return "";
}

export function houseComputerLabel(computer?: HouseComputer | null) {
  const mode = computer?.isolation?.mode;
  if (mode === "container") return "isolated Chromium";
  if (mode === "shared" || computer?.backend === "live") return "shared Chromium";
  if (mode === "in-process" || computer) return "in-process computer";
  return "";
}

export function houseComputerLabelFromBots(bots: HouseMember[]) {
  const computers = bots.map((bot) => bot.workspace?.computer).filter(Boolean) as HouseComputer[];
  if (computers.some((computer) => computer.isolation?.mode === "container")) return "isolated Chromium";
  if (computers.some((computer) => computer.isolation?.mode === "shared" || computer.backend === "live")) {
    return "shared Chromium";
  }
  if (computers.length > 0) return "in-process computer";
  return "";
}

export function isHouseRunning(status?: string | null) {
  const value = (status || "").trim().toLowerCase();
  return value === "running" || value === "starting";
}

export function summarizeHouseStatus(bots: HouseMember[]): HouseStatus {
  const leader = findExistingLeaderbot(bots);
  const modelId = (leader?.modelId || bots.find((bot) => bot.modelId)?.modelId || "").trim();
  const computer = houseComputerLabelFromBots(bots);
  const running = bots.filter((bot) => isHouseRunning(bot.status)).length;
  const parts = ["OpenBot", modelId, computer].filter(Boolean);
  return {
    runtimeName: "OpenBot",
    modelId,
    computer,
    running,
    total: bots.length,
    line: parts.join(" · "),
  };
}

export function openBotHouseView<T extends HouseMember>(agents: T[]): OpenBotHouseView<T> {
  const bots = pinLeaderbotFirst(agents.filter((agent) => isOpenBotRuntime(agent.runtime) || !agent.runtime));
  const leader = findExistingLeaderbot(bots) ?? null;
  return {
    leader,
    members: bots.filter((bot) => !isLeaderbotChannel(bot)),
    bots,
    status: summarizeHouseStatus(bots),
  };
}
