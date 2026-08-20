import { describe, expect, test } from "bun:test";
import { executeTool } from "./agent-execute";
import { emptyWorkspace, readWorkspace, workspacePublic } from "./agent-workspace";
import {
  cosineSimilarity,
  createGatewayEmbeddingsClient,
  embeddingsClientFromEnv,
  formatPromptMemory,
  inferMemoryKind,
  lexicalScore,
  rankMemoryItems,
  recallWorkspace,
  rememberWithEmbedding,
  type MemoryCandidate,
} from "./agent-memory";

function note(
  id: string,
  content: string,
  kind: MemoryCandidate["kind"],
  createdAt: string,
  extra?: Partial<MemoryCandidate>,
): MemoryCandidate {
  return { id, content, kind, createdAt, source: "memory", ...extra };
}

describe("memory ranker", () => {
  test("substring match outranks an unrelated note", () => {
    const ranked = rankMemoryItems(
      [
        note("old", "ship the billing invoice tonight", "note", "2026-01-01T00:00:00.000Z"),
        note("hit", "user prefers dark mode in the dashboard", "semantic", "2026-01-02T00:00:00.000Z"),
      ],
      { query: "dark mode" },
    );
    expect(ranked[0]?.id).toBe("hit");
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  test("token overlap scores a query that is not an exact phrase", () => {
    expect(lexicalScore("I drink pour-over coffee every morning", "coffee beans")).toBeGreaterThan(0);
    expect(lexicalScore("I drink pour-over coffee every morning", "coffee beans")).toBeLessThan(1);
  });

  test("kind preference lifts matching notes", () => {
    const ranked = rankMemoryItems(
      [
        note("ep", "talked about coffee in yesterday's standup", "episodic", "2026-08-20T12:00:00.000Z"),
        note("sem", "prefers oat milk in coffee", "semantic", "2026-08-01T12:00:00.000Z"),
      ],
      { query: "coffee", kind: "semantic" },
    );
    expect(ranked[0]?.id).toBe("sem");
    expect(inferMemoryKind("what is my preference")).toBe("semantic");
  });

  test("recency breaks ties on the same topic", () => {
    const ranked = rankMemoryItems(
      [
        note("older", "API token lives in vault/prod", "note", "2026-01-01T00:00:00.000Z"),
        note("newer", "API token lives in vault/staging", "note", "2026-08-01T00:00:00.000Z"),
      ],
      { query: "API token" },
    );
    expect(ranked[0]?.id).toBe("newer");
  });

  test("no query returns recent notes, optionally filtered by kind", () => {
    const items = [
      note("w", "draft the weekly recap", "working", "2026-08-18T00:00:00.000Z"),
      note("s", "prefers short replies", "semantic", "2026-08-19T00:00:00.000Z"),
      note("n", "random scratch", "note", "2026-08-20T00:00:00.000Z"),
    ];
    expect(rankMemoryItems(items, { limit: 2 })[0]?.id).toBe("n");
    expect(rankMemoryItems(items, { kind: "semantic" })[0]?.id).toBe("s");
  });

  test("vector similarity blends with lexical + kind + recency", () => {
    const items = [
      note("lex", "exactly mentions penguin tuxedo rental", "note", "2026-01-01T00:00:00.000Z"),
      note("sem", "formal wear booking for the gala", "semantic", "2026-01-02T00:00:00.000Z"),
    ];
    const lexicalFirst = rankMemoryItems(items, { query: "penguin tuxedo" });
    expect(lexicalFirst[0]?.id).toBe("lex");

    const blended = rankMemoryItems(items, {
      query: "penguin tuxedo",
      kind: "semantic",
      similarities: { lex: 0.05, sem: 0.98 },
    });
    expect(blended[0]?.id).toBe("sem");
    expect(blended[0]?.score).toBeGreaterThan(blended[1]?.score ?? 0);
  });

  test("cosine similarity is 1 for parallel vectors and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [1])).toBe(0);
  });

  test("a preference query still returns semantic notes without a substring hit", () => {
    const ranked = rankMemoryItems(
      [
        note("sem", "likes short replies", "semantic", "2026-08-01T00:00:00.000Z"),
        note("ep", "said hello yesterday", "episodic", "2026-08-20T00:00:00.000Z"),
      ],
      { query: "what is my preference?" },
    );
    expect(ranked.map((h) => h.id)).toEqual(["sem"]);
  });

  test("unrelated queries return no hits instead of dumping recents", () => {
    expect(rankMemoryItems(
      [note("n", "unrelated scratch", "note", "2026-08-20T00:00:00.000Z")],
      { query: "quantum lattice" },
    )).toEqual([]);
  });

  test("caps at 8 hits", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      note(`n${i}`, `note ${i} about shipping`, "note", `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    expect(rankMemoryItems(items, { query: "shipping" })).toHaveLength(8);
  });
});

describe("prompt memory", () => {
  test("injects the relevant note for a user turn instead of only the last items", () => {
    const ws = emptyWorkspace();
    ws.memory = [
      { id: "a", kind: "note", content: "oldest scratch", createdAt: "2026-08-18T00:00:00.000Z" },
      { id: "b", kind: "note", content: "middle chat about weather", createdAt: "2026-08-19T00:00:00.000Z" },
      { id: "c", kind: "semantic", content: "billing contact is Ada", createdAt: "2026-08-10T00:00:00.000Z" },
      { id: "d", kind: "note", content: "newest scratch", createdAt: "2026-08-20T00:00:00.000Z" },
    ];
    const relevant = formatPromptMemory(ws, "who handles billing?");
    expect(relevant).toContain("billing contact is Ada");
    const recent = formatPromptMemory(ws);
    expect(recent).toContain("newest scratch");
  });
});

describe("embeddings client", () => {
  test("stays off when AGENT_EMBEDDING_MODEL is unset", () => {
    expect(embeddingsClientFromEnv({
      baseUrl: "http://gateway.test",
      apiKey: "opd_test",
      env: {},
    })).toBeUndefined();
  });

  test("POSTs /v1/embeddings and reads vectors", async () => {
    const client = createGatewayEmbeddingsClient({
      baseUrl: "http://gateway.test",
      apiKey: "opd_test",
      model: "BAAI/bge-base-en-v1.5",
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe("BAAI/bge-base-en-v1.5");
        expect(body.input).toBe("hello");
        return new Response(JSON.stringify({
          data: [{ embedding: [0.1, 0.2], index: 0 }],
        }), { status: 200 });
      }) as typeof fetch,
    });
    await expect(client.embed(["hello"])).resolves.toEqual([[0.1, 0.2]]);
  });

  test("returns null on gateway failure so recall can fall back", async () => {
    const client = createGatewayEmbeddingsClient({
      baseUrl: "http://gateway.test",
      apiKey: "opd_test",
      model: "BAAI/bge-base-en-v1.5",
      fetchImpl: (async () => new Response("nope", { status: 503 })) as typeof fetch,
    });
    await expect(client.embed(["hello"])).resolves.toBeNull();
  });
});

describe("remember and recall tools", () => {
  test("recall ranks by query instead of last-N substring filter", async () => {
    let ws = emptyWorkspace();
    const older = await executeTool(
      "openbot",
      "remember",
      JSON.stringify({ content: "Ada owns billing and invoices", kind: "semantic" }),
      ws,
    );
    ws = older.workspace;
    ws.memory = [
      ...ws.memory,
      { id: "later", kind: "note", content: "weather is fine today", createdAt: "2099-01-01T00:00:00.000Z" },
    ];
    const recalled = await executeTool(
      "openbot",
      "recall",
      JSON.stringify({ query: "billing invoices" }),
      ws,
    );
    expect(recalled.event.ok).toBe(true);
    expect(recalled.result).toContain("Ada owns billing");
    expect(recalled.result).not.toContain("weather is fine");
  });

  test("recall without a query returns recent notes", async () => {
    const ws = emptyWorkspace();
    ws.memory = [
      { id: "old", kind: "note", content: "old note", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", kind: "note", content: "new note", createdAt: "2026-08-20T00:00:00.000Z" },
    ];
    const recalled = await executeTool("openbot", "recall", "{}", ws);
    expect(recalled.result.startsWith("[note] new note")).toBe(true);
  });

  test("recall includes mirrored workspace files when they match", async () => {
    const ws = emptyWorkspace();
    ws.computer.files = [{
      path: "/workspace/brief.md",
      content: "Launch OpenBot memory recall this week",
      updatedAt: "2026-08-20T00:00:00.000Z",
    }];
    const recalled = await executeTool(
      "openbot",
      "recall",
      JSON.stringify({ query: "OpenBot memory" }),
      ws,
    );
    expect(recalled.result).toContain("[file /workspace/brief.md]");
    expect(recalled.result).toContain("Launch OpenBot memory recall");
  });

  test("stores note embeddings when the gateway client works", async () => {
    const stored = await rememberWithEmbedding(
      { id: "1", kind: "note", content: "prefers dark mode", createdAt: "2026-08-20T00:00:00.000Z" },
      { model: "BAAI/bge-base-en-v1.5", embed: async () => [[0.2, 0.8]] },
    );
    expect(stored.embedding).toEqual([0.2, 0.8]);
    expect(stored.embeddingModel).toBe("BAAI/bge-base-en-v1.5");
  });

  test("recall still works when embeddings fail", async () => {
    const ws = emptyWorkspace();
    ws.memory = [
      { id: "hit", kind: "note", content: "q3 roadmap is public", createdAt: "2026-08-20T00:00:00.000Z" },
    ];
    const recalled = await recallWorkspace(
      ws,
      { query: "roadmap" },
      { model: "BAAI/bge-base-en-v1.5", embed: async () => null },
    );
    expect(recalled.hits[0]?.content).toContain("q3 roadmap");
  });

  test("workspacePublic strips embedding vectors", () => {
    const ws = readWorkspace({
      memory: [{
        id: "1",
        kind: "note",
        content: "secret-ish note",
        createdAt: "2026-08-20T00:00:00.000Z",
        embedding: [0.1, 0.2],
        embeddingModel: "BAAI/bge-base-en-v1.5",
      }],
    });
    expect(ws.memory[0]?.embedding).toEqual([0.1, 0.2]);
    expect(workspacePublic(ws).memory[0]).toEqual({
      id: "1",
      kind: "note",
      content: "secret-ish note",
      createdAt: "2026-08-20T00:00:00.000Z",
    });
  });

  test("executeTool remember writes an embedding through ctx", async () => {
    const result = await executeTool(
      "openbot",
      "remember",
      JSON.stringify({ content: "prefers dark mode", kind: "semantic" }),
      emptyWorkspace(),
      {
        embeddings: {
          model: "BAAI/bge-base-en-v1.5",
          embed: async () => [[1, 0, 0]],
        },
      },
    );
    expect(result.event.ok).toBe(true);
    expect(result.workspace.memory[0]?.embedding).toEqual([1, 0, 0]);
  });
});
