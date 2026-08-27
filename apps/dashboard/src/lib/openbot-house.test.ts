import { describe, expect, test } from "bun:test";
import {
  houseChannelPreview,
  houseComputerLabel,
  isOpenBotStatusBanner,
  openBotHouseView,
  partitionAgentRuntimes,
  summarizeHouseStatus,
} from "./openbot-house";

const isolated = { isolation: { mode: "container" as const }, backend: "live" as const };

describe("OpenBot house grouping", () => {
  test("keeps Hermes and other runtimes outside the OpenBot house", () => {
    const { house, others } = partitionAgentRuntimes([
      { id: "1", name: "Leaderbot", runtime: "openbot" },
      { id: "2", name: "General Assistant", runtime: "openbot" },
      { id: "3", name: "Desk", runtime: "hermes" },
      { id: "4", name: "test", runtime: "openbot" },
    ]);
    expect(house.map((agent) => agent.name)).toEqual(["Leaderbot", "General Assistant", "test"]);
    expect(others.map((agent) => agent.name)).toEqual(["Desk"]);
  });

  test("treats Leaderbot as the house header and everyone else as members", () => {
    const view = openBotHouseView([
      { id: "g", name: "General Assistant", runtime: "openbot", status: "running" },
      { id: "l", name: "Leaderbot", runtime: "openbot", kind: "leader", status: "running", modelId: "deepseek-v3" },
      { id: "t", name: "test", runtime: "openbot", status: "running" },
    ]);
    expect(view.leader?.id).toBe("l");
    expect(view.members.map((member) => member.name)).toEqual(["General Assistant", "test"]);
    expect(view.status.line).toBe("OpenBot · deepseek-v3");
    expect(view.status.running).toBe(3);
    expect(view.status.total).toBe(3);
  });

  test("states runtime, model, and computer once from the house, not per bot", () => {
    const status = summarizeHouseStatus([
      {
        id: "l",
        name: "Leaderbot",
        kind: "leader",
        modelId: "deepseek-v3",
        status: "running",
        workspace: { computer: isolated },
      },
      {
        id: "g",
        name: "General Assistant",
        modelId: "deepseek-v3",
        status: "running",
        workspace: { computer: isolated },
      },
    ]);
    expect(status.line).toBe("OpenBot · deepseek-v3 · isolated Chromium");
    expect(status.computer).toBe("isolated Chromium");
  });

  test("hides the duplicated live banner so member rows can show a last message", () => {
    expect(
      isOpenBotStatusBanner("OpenBot is live on deepseek-v3 · gateway 269ms · 187 models · isolated Chromium"),
    ).toBe(true);
    expect(isOpenBotStatusBanner("Booting OpenBot on deepseek-v3…")).toBe(true);
    expect(houseChannelPreview("open chrome", "OpenBot is live on deepseek-v3")).toBe("open chrome");
    expect(houseChannelPreview("OpenBot is live on deepseek-v3 · 187 models", null)).toBe("");
    expect(houseComputerLabel({ isolation: { mode: "in-process" } })).toBe("in-process computer");
  });
});
