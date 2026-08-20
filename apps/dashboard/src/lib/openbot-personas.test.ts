import { describe, expect, test } from "bun:test";
import {
  DEFAULT_OPENBOT_PERSONA,
  formatChannelTime,
  matchingChannels,
  parseComposerAsk,
  snippet,
} from "./openbot-personas";

describe("OpenBot home copy", () => {
  test("routes an @mention to that coworker and leaves the rest of the ask", () => {
    expect(parseComposerAsk("@Knowledge cited 3 sources").persona.name).toBe("Knowledge");
    expect(parseComposerAsk("@Knowledge cited 3 sources").message).toBe("cited 3 sources");
    expect(parseComposerAsk("hello").persona.id).toBe(DEFAULT_OPENBOT_PERSONA.id);
    expect(parseComposerAsk("@Leaderbot bring Research online").persona.id).toBe("leader");
    expect(parseComposerAsk("@Leaderbot bring Research online").message).toBe("bring Research online");
  });

  test("filters the roster by name or last line, not by hidden history", () => {
    const channels = [
      { name: "Knowledge", lastMessage: "cited 3 sources from Drive" },
      { name: "Metrics", lastMessage: "Q3 ticket volume, down 18%" },
    ];
    expect(matchingChannels(channels, "drive").map((c) => c.name)).toEqual(["Knowledge"]);
    expect(matchingChannels(channels, "  ")).toEqual(channels);
  });

  test("shows today's clock time the way the official home does", () => {
    const now = new Date();
    now.setHours(11, 8, 0, 0);
    expect(formatChannelTime(now)).toMatch(/11:08/);
    expect(snippet("cited 3 sources from Drive and OneDrive extra", 28)).toMatch(/^cited 3 sources from Drive/);
    expect(snippet("cited 3 sources from Drive and OneDrive extra", 28).endsWith("…")).toBe(true);
  });
});
