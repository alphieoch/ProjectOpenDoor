import { describe, expect, test } from "bun:test";
import {
  formatHouseMutationResult,
  formatListCoworkersResult,
  houseAgentStatusLabel,
  houseToolLabel,
  houseToolThreadContent,
} from "./openbot-tool-display";
import { WEB_SEARCH_TOOL_NAME } from "@opendoor/shared";

const LIVE = "OpenBot is live on deepseek-v3 · gateway 139ms · 187 models · isolated Chromium";
const TEST_ID = "67f9caa8-1111-2222-3333-444455556666";
const GENERAL_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const LEADER_ID = "ffffffff-0000-1111-2222-333333333333";

describe("house tool display", () => {
  test("list_coworkers summary uses name, role, and status — not live banner, uuid, or gateway", () => {
    const { display, result, coworkers } = formatListCoworkersResult({
      leaderId: LEADER_ID,
      coworkers: [
        {
          id: TEST_ID,
          name: "test",
          kind: "coworker",
          status: "running",
          modelId: "deepseek-v3",
          lastMessage: LIVE,
          statusMessage: LIVE,
        },
        {
          id: GENERAL_ID,
          name: "General Assistant",
          kind: "coworker",
          status: "running",
          modelId: "deepseek-v3",
          lastMessage: LIVE,
        },
        {
          id: LEADER_ID,
          name: "Leaderbot",
          kind: "leader",
          status: "running",
          modelId: "deepseek-v3",
          statusMessage: LIVE,
        },
      ],
    });

    expect(display).toContain("test — coworker · Running");
    expect(display).toContain("General Assistant — coworker · Running");
    expect(display).toContain("Leaderbot — leader (you) · Running");
    expect(display).toContain("deepseek-v3");
    expect(display).not.toMatch(/OpenBot is live/i);
    expect(display).not.toMatch(/gateway/i);
    expect(display).not.toContain(TEST_ID);
    expect(display).not.toContain(LEADER_ID);
    expect(display).not.toMatch(/id=/);
    expect(display).not.toMatch(/computer=/);
    expect(display).not.toMatch(/status=/);

    const payload = JSON.parse(result) as { coworkers: Array<{ id: string; name: string }>; display: string };
    expect(payload.display).toBe(display);
    expect(payload.coworkers.map((bot) => bot.id)).toEqual([TEST_ID, GENERAL_ID, LEADER_ID]);
    expect(coworkers?.map((bot) => bot.role)).toEqual(["coworker", "coworker", "leader"]);
  });

  test("empty house is one short line", () => {
    const { display, result } = formatListCoworkersResult({ coworkers: [] });
    expect(display).toBe("No OpenBot coworkers in this house yet.");
    expect(display).not.toMatch(/\n/);
    expect(JSON.parse(result).coworkers).toEqual([]);
  });

  test("maps agent status to Ready / Running / Stopped", () => {
    expect(houseAgentStatusLabel("running")).toBe("Running");
    expect(houseAgentStatusLabel("starting")).toBe("Running");
    expect(houseAgentStatusLabel("stopped")).toBe("Stopped");
    expect(houseAgentStatusLabel("failed")).toBe("Stopped");
    expect(houseAgentStatusLabel("idle")).toBe("Ready");
    expect(houseAgentStatusLabel("")).toBe("Ready");
  });

  test("delete confirmation joins names and keeps ids only in JSON", () => {
    const { display, result, ok } = formatHouseMutationResult({
      action: "delete",
      outcomes: [
        { ok: true, id: TEST_ID, name: "test" },
        { ok: true, id: GENERAL_ID, name: "General Assistant" },
      ],
    });
    expect(display).toBe("Removed test and General Assistant. Recoverable for 7 days in OpenBot settings.");
    expect(display).not.toContain(TEST_ID);
    expect(display).not.toContain(GENERAL_ID);
    expect(ok).toBe(true);
    const payload = JSON.parse(result) as { changed: Array<{ id: string; name: string }> };
    expect(payload.changed).toEqual([
      { id: TEST_ID, name: "test" },
      { id: GENERAL_ID, name: "General Assistant" },
    ]);
  });

  test("stop and restore stay short and id-free", () => {
    expect(
      formatHouseMutationResult({
        action: "stop",
        outcomes: [{ ok: true, id: TEST_ID, name: "test" }],
      }).display,
    ).toBe("Paused test. Chat and memory are kept.");
    expect(
      formatHouseMutationResult({
        action: "restore",
        outcomes: [{ ok: true, id: TEST_ID, name: "test" }],
      }).display,
    ).toBe("Restored test. Start it again to attach the computer.");
  });

  test("thread renderer prefers display JSON and reformats a legacy dump", () => {
    expect(houseToolLabel("list_coworkers")).toBe("List coworkers");
    expect(houseToolLabel("delete_coworker")).toBe("Remove coworker");

    const json = JSON.stringify({
      display: "Removed test and General Assistant. Recoverable for 7 days in OpenBot settings.",
      changed: [{ id: TEST_ID, name: "test" }],
    });
    expect(houseToolThreadContent("delete_coworker", json)).toBe(
      "Removed test and General Assistant. Recoverable for 7 days in OpenBot settings.",
    );

    const dump = [
      `- test (coworker) id=${TEST_ID} status=running model=deepseek-v3 computer=isolated Chromium — ${LIVE}`,
      `- Leaderbot (leader, you) id=${LEADER_ID} status=running model=deepseek-v3 computer=isolated Chromium — ${LIVE}`,
    ].join("\n");
    const recovered = houseToolThreadContent("list_coworkers", dump);
    expect(recovered).toContain("test — coworker · Running");
    expect(recovered).toContain("Leaderbot — leader (you) · Running");
    expect(recovered).not.toMatch(/OpenBot is live/i);
    expect(recovered).not.toMatch(/gateway/i);
    expect(recovered).not.toContain(TEST_ID);

    expect(
      houseToolThreadContent(
        "delete_coworker",
        `Deleted test (${TEST_ID}). Recoverable for 7 days in OpenBot settings.\nDeleted General Assistant (${GENERAL_ID}). Recoverable for 7 days in OpenBot settings.`,
      ),
    ).toBe("Removed test and General Assistant. Recoverable for 7 days in OpenBot settings.");
  });

  test("web_search chip shows a short answer and citation links — not skip-links", () => {
    expect(houseToolLabel(WEB_SEARCH_TOOL_NAME)).toBe("Search");
    const skip = "All Points East | Home Skip to content Skip to footer Tickets 2026 LINEUP";
    const content = JSON.stringify({
      query: "how old is Lil Baby",
      answer: "Lil Baby is 31 years old (born December 3, 1994).",
      provider: "vertex_google_search",
      citations: [
        { title: skip, url: "https://en.wikipedia.org/wiki/Lil_Baby", snippet: skip },
        { title: "Lil Baby Biography", url: "https://www.biography.com/musicians/lil-baby", snippet: "born 1994" },
      ],
    });
    const display = houseToolThreadContent(WEB_SEARCH_TOOL_NAME, content);
    expect(display).toContain("Lil Baby is 31 years old");
    expect(display).toContain("https://en.wikipedia.org/wiki/Lil_Baby");
    expect(display).toContain("https://www.biography.com/musicians/lil-baby");
    expect(display).not.toMatch(/Skip to content/i);
    expect(display).not.toMatch(/Skip to footer/i);
  });
});
