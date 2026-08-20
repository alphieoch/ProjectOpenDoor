import { describe, expect, test } from "bun:test";
import { readWorkspace } from "@opendoor/shared";
import { getOpenBotPersona, parseComposerAsk } from "./openbot-personas";
import {
  LEADERBOT_KIND,
  LEADERBOT_MANAGE_TOOL_NAMES,
  LEADERBOT_NAME,
  LEADERBOT_READ_TOOL_NAMES,
  LEADERBOT_TOOL_NAMES,
  LEADERBOT_TURN_GUIDANCE,
  leaderbotSystemPrompt,
  decideHouseAction,
  decideSpawn,
  findExistingLeaderbot,
  isLeaderbotChannel,
  isLeaderbotSelfTarget,
  leaderToolsForSettings,
  pinLeaderbotFirst,
  summarizeOpenBotCapacity,
  type OpenBotCapacity,
} from "./openbot-leader";
import { LEADERBOT_PERSONA } from "./openbot-personas";

const ready: OpenBotCapacity = {
  plan: "pro",
  enterprise: false,
  addonActive: true,
  addonStatus: "active",
  addonIncludedInPlan: false,
  modelId: "openweight-chat",
  modelReady: true,
  bots: 2,
  running: 1,
  maxBots: 10,
  maxConcurrentAgents: 2,
  computer: {
    supervisor: false,
    sharedComputer: false,
    live: 0,
    inProcess: 2,
    isolated: 0,
  },
};

describe("Leaderbot identity", () => {
  test("is a first-class persona with a leader kind", () => {
    expect(LEADERBOT_PERSONA.id).toBe("leader");
    expect(LEADERBOT_PERSONA.name).toBe(LEADERBOT_NAME);
    expect(LEADERBOT_TURN_GUIDANCE).toMatch(/web_search/);
    expect(LEADERBOT_TURN_GUIDANCE).toMatch(/factual question/);
    expect(leaderbotSystemPrompt()).toMatch(/browse a specific page/);
    expect(LEADERBOT_PERSONA.systemPrompt).toContain("web_search");
    expect(LEADERBOT_KIND).toBe("leader");
    expect(getOpenBotPersona("leader").name).toBe("Leaderbot");
    expect(LEADERBOT_TOOL_NAMES).toEqual([
      "list_coworkers",
      "inspect_resources",
      "spawn_coworker",
      "stop_coworker",
      "delete_coworker",
      "restore_coworker",
    ]);
    expect(readWorkspace({ kind: "leader", memory: [] }).kind).toBe("leader");
  });

  test("matches kind or the Leaderbot name, not a regular coworker", () => {
    expect(isLeaderbotChannel({ name: "Leaderbot" })).toBe(true);
    expect(isLeaderbotChannel({ name: "General Assistant", kind: "leader" })).toBe(true);
    expect(isLeaderbotChannel({ name: "test", workspace: { kind: "leader" } })).toBe(true);
    expect(isLeaderbotChannel({ name: "General Assistant" })).toBe(false);
    expect(isLeaderbotChannel({ name: "test" })).toBe(false);
  });

  test("routes an @Leaderbot ask to the orchestrator", () => {
    const parsed = parseComposerAsk("@Leaderbot bring Research online");
    expect(parsed.persona.id).toBe("leader");
    expect(parsed.message).toBe("bring Research online");
  });
});

describe("Leaderbot resource limits", () => {
  test("refuses to spawn when the Agents add-on is locked", () => {
    const decision = decideSpawn({
      capacity: { ...ready, addonActive: false, addonStatus: "inactive" },
      action: "create",
      source: "leader",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("addon_locked");
    expect(decision.reason).toMatch(/add-on/i);
  });

  test("refuses to spawn when no model is ready", () => {
    const decision = decideSpawn({
      capacity: { ...ready, modelId: "", modelReady: false },
      action: "create",
      source: "leader",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("model_missing");
  });

  test("refuses to spawn at the concurrent running cap", () => {
    const decision = decideSpawn({
      capacity: { ...ready, running: 2 },
      action: "start",
      source: "leader",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("at_concurrent_cap");
    expect(decision.reason).toContain("2 concurrent");
  });

  test("refuses to create past the plan bot cap", () => {
    const decision = decideSpawn({
      capacity: { ...ready, bots: 10 },
      action: "create",
      source: "leader",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("at_bot_cap");
  });

  test("refuses Leaderbot spawning another Leaderbot", () => {
    const decision = decideSpawn({
      capacity: ready,
      action: "create",
      source: "leader",
      requestedKind: "leader",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("leader_forbidden");
  });

  test("allows a specialist when addon, model, and caps are open", () => {
    const decision = decideSpawn({
      capacity: ready,
      action: "create",
      source: "leader",
      requestedKind: "coworker",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("ok");
    expect(decision.warning).toMatch(/in-process/i);
  });

  test("summarizes plan limits from real bots instead of invented numbers", () => {
    const capacity = summarizeOpenBotCapacity({
      plan: "enterprise",
      addonActive: true,
      addonIncludedInPlan: true,
      modelId: "openweight-chat",
      supervisor: true,
      bots: [
        { status: "running", computer: { backend: "live", isolation: { mode: "container" } } },
        { status: "stopped", computer: { backend: "fetch", isolation: { mode: "in-process" } } },
      ],
    });
    expect(capacity.plan).toBe("enterprise");
    expect(capacity.enterprise).toBe(true);
    expect(capacity.bots).toBe(2);
    expect(capacity.running).toBe(1);
    expect(capacity.maxConcurrentAgents).toBe(20);
    expect(capacity.maxBots).toBe(500);
    expect(capacity.computer.isolated).toBe(1);
    expect(capacity.computer.supervisor).toBe(true);
  });
});

describe("Leaderbot creation is unique", () => {
  test("finds the existing Leaderbot by kind or name and does not invent a second", () => {
    const channels = [
      { id: "a", name: "General Assistant" },
      { id: "b", name: "Lead", kind: "leader" as const },
      { id: "c", name: "test" },
    ];
    expect(findExistingLeaderbot(channels)?.id).toBe("b");
    expect(findExistingLeaderbot([{ id: "1", name: "Leaderbot" }])?.id).toBe("1");
    expect(findExistingLeaderbot([{ id: "1", name: "General Assistant" }])).toBeUndefined();
  });

  test("pins a single Leaderbot at the top of the rail", () => {
    const pinned = pinLeaderbotFirst([
      { id: "a", name: "General Assistant" },
      { id: "b", name: "Leaderbot" },
      { id: "c", name: "test" },
    ]);
    expect(pinned.map((channel) => channel.name)).toEqual(["Leaderbot", "General Assistant", "test"]);
  });

  test("stop and delete refuse Leaderbot itself", () => {
    expect(isLeaderbotSelfTarget({ leaderId: "lead-1", targetId: "lead-1", targetName: "Leaderbot" })).toBe(true);
    expect(isLeaderbotSelfTarget({ leaderId: "lead-1", targetId: "c1", targetName: "test" })).toBe(false);
    expect(decideHouseAction({ enabled: true, action: "stop", targetIsLeader: true }).allowed).toBe(false);
    expect(decideHouseAction({ enabled: true, action: "stop", targetIsLeader: true }).code).toBe("leader_forbidden");
    expect(decideHouseAction({ enabled: true, action: "delete", targetIsLeader: true }).allowed).toBe(false);
    expect(decideHouseAction({ enabled: true, action: "delete", targetIsLeader: true }).code).toBe("leader_forbidden");
  });

  test("gates add, stop, and delete when house management is off", () => {
    expect(leaderToolsForSettings(false)).toEqual([...LEADERBOT_READ_TOOL_NAMES]);
    expect(leaderToolsForSettings(false)).not.toContain("spawn_coworker");
    expect(leaderToolsForSettings(true)).toEqual([...LEADERBOT_TOOL_NAMES]);
    expect(LEADERBOT_MANAGE_TOOL_NAMES).toContain("spawn_coworker");
    expect(decideHouseAction({ enabled: false, action: "spawn" }).code).toBe("house_management_off");
    expect(decideHouseAction({ enabled: false, action: "stop" }).code).toBe("house_management_off");
    expect(decideHouseAction({ enabled: false, action: "delete" }).code).toBe("house_management_off");
  });

  test("spawn still works when house management is enabled", () => {
    expect(decideHouseAction({ enabled: true, action: "spawn" }).allowed).toBe(true);
    const decision = decideSpawn({
      capacity: ready,
      action: "create",
      source: "leader",
      requestedKind: "coworker",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("ok");
  });

  test("treats a second create as a duplicate once one Leaderbot exists", () => {
    const decision = decideSpawn({
      capacity: ready,
      action: "create",
      source: "user",
      requestedKind: "leader",
      alreadyExists: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("duplicate_leader");
  });
});
