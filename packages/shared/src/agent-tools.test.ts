import { describe, expect, test } from "bun:test";
import { executeTool } from "./agent-execute";
import { toolsForRuntime, type SearchSpendGate } from "./agent-tools";
import { emptyWorkspace } from "./agent-workspace";
import { WEB_SEARCH_TOOL_NAME } from "./rag-search-contract";
import { setRagSearchRunner } from "./rag-search";
import { SEARCH_QUERY_LIST_CENTS } from "./platform-tools";

function allowSearch(chargeCents = 0): SearchSpendGate {
  return {
    authorize: async () => ({ ok: true, chargeCents }),
    settle: async () => {},
  };
}

describe("agent web_search tool", () => {
  test("exposes web_search on OpenBot, Leaderbot runtime, and other gateway agents", () => {
    for (const runtime of ["openbot", "openclaw", "hermes", "nemoclaw"] as const) {
      const names = toolsForRuntime(runtime).map((tool) => tool.function.name);
      expect(names).toContain(WEB_SEARCH_TOOL_NAME);
    }
    const search = toolsForRuntime("openbot").find((tool) => tool.function.name === WEB_SEARCH_TOOL_NAME);
    expect(search?.function.description).toMatch(/OpenDoor Search/i);
    expect(search?.function.description).toMatch(/factual/i);
  });

  test("executeTool returns a chip display with answer + citations, not page chrome", async () => {
    setRagSearchRunner(async ({ query }) => ({
      query,
      answer: "Lil Baby is 31 years old (born December 3, 1994).",
      provider: "vertex_google_search",
      citations: [
        {
          title: "Home Skip to content Skip to footer Tickets",
          url: "https://en.wikipedia.org/wiki/Lil_Baby",
          snippet: "Skip to content Dominique Jones",
        },
        {
          title: "Lil Baby Biography",
          url: "https://www.biography.com/musicians/lil-baby",
          snippet: "Born December 3, 1994",
        },
      ],
    }));
    try {
      const executed = await executeTool(
        "openbot",
        WEB_SEARCH_TOOL_NAME,
        JSON.stringify({ query: "how old is Lil Baby" }),
        emptyWorkspace(),
        { searchSpend: allowSearch(0) },
      );
      expect(executed.event.ok).toBe(true);
      expect(executed.event.name).toBe("web_search");
      expect(executed.display).toContain("Lil Baby is 31 years old");
      expect(executed.display).toContain("https://en.wikipedia.org/wiki/Lil_Baby");
      expect(executed.display).toContain("https://www.biography.com/musicians/lil-baby");
      expect(executed.display).not.toMatch(/Skip to content/i);
      expect(executed.result).toContain("vertex_google_search");
      const payload = JSON.parse(executed.result) as { answer: string; citations: unknown[] };
      expect(payload.answer).toContain("31");
      expect(payload.citations).toHaveLength(2);
    } finally {
      setRagSearchRunner(null);
    }
  });

  test("unpaid org cannot invoke Search; debit amount matches catalog; admin bypass", async () => {
    let ran = 0;
    let settled = 0;
    setRagSearchRunner(async ({ query }) => {
      ran += 1;
      return {
        query,
        answer: "ok",
        provider: "vertex_google_search",
        citations: [{ title: "Docs", url: "https://example.com", snippet: "ok" }],
      };
    });
    try {
      const denied = await executeTool(
        "openbot",
        WEB_SEARCH_TOOL_NAME,
        JSON.stringify({ query: "who is Lil Baby" }),
        emptyWorkspace(),
        {
          searchSpend: {
            authorize: async () => ({
              ok: false,
              error: "OpenDoor Search needs $0.10 spendable credit. Top up on Billing.",
            }),
            settle: async () => {
              settled += 1;
            },
          },
        },
      );
      expect(denied.event.ok).toBe(false);
      expect(denied.result).toMatch(/\$0\.10/);
      expect(ran).toBe(0);
      expect(settled).toBe(0);

      const missing = await executeTool(
        "openbot",
        WEB_SEARCH_TOOL_NAME,
        JSON.stringify({ query: "who is Lil Baby" }),
        emptyWorkspace(),
      );
      expect(missing.event.ok).toBe(false);
      expect(missing.event.detail).toBe("search_not_entitled");
      expect(ran).toBe(0);

      const paid = await executeTool(
        "openbot",
        WEB_SEARCH_TOOL_NAME,
        JSON.stringify({ query: "who is Lil Baby" }),
        emptyWorkspace(),
        {
          searchSpend: {
            authorize: async () => ({ ok: true, chargeCents: SEARCH_QUERY_LIST_CENTS }),
            settle: async (cents) => {
              expect(cents).toBe(SEARCH_QUERY_LIST_CENTS);
              settled += 1;
            },
          },
        },
      );
      expect(paid.event.ok).toBe(true);
      expect(ran).toBe(1);
      expect(settled).toBe(1);
      expect(JSON.parse(paid.result).chargedCents).toBe(SEARCH_QUERY_LIST_CENTS);

      const admin = await executeTool(
        "openbot",
        WEB_SEARCH_TOOL_NAME,
        JSON.stringify({ query: "who is Lil Baby" }),
        emptyWorkspace(),
        { searchSpend: allowSearch(0) },
      );
      expect(admin.event.ok).toBe(true);
      expect(ran).toBe(2);
      expect(settled).toBe(1);
    } finally {
      setRagSearchRunner(null);
    }
  });
});
