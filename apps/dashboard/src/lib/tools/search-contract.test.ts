import { describe, expect, test } from "bun:test";
import { SEARCH_TOOL_ID, normalizeSearchResult } from "./search-contract";

describe("OpenDoor Search invoke contract", () => {
  test("catalog id is search", () => {
    expect(SEARCH_TOOL_ID).toBe("search");
  });

  test("reads answer + citations from the product payload", () => {
    const result = normalizeSearchResult({
      tool: "search",
      query: "What is OpenDoor Search?",
      answer: "A first-party answer engine on our Vertex stack.",
      citations: [
        { title: "Docs", url: "https://opendoor.example/docs", snippet: "Vertex" },
        { title: "Docs", url: "https://opendoor.example/docs" },
      ],
      provider: "vertex_google_search",
    });
    expect(result).toEqual({
      answer: "A first-party answer engine on our Vertex stack.",
      citations: [{ title: "Docs", url: "https://opendoor.example/docs", snippet: "Vertex" }],
      provider: "vertex_google_search",
      query: "What is OpenDoor Search?",
    });
  });

  test("maps sibling invoke step.text / step.results", () => {
    const result = normalizeSearchResult({
      tool: "search",
      step: {
        text: "Cited answer",
        results: [{ title: "Source", url: "https://example.com/a" }],
        provider: "vertex",
        query: "q",
      },
    });
    expect(result?.answer).toBe("Cited answer");
    expect(result?.citations).toEqual([{ title: "Source", url: "https://example.com/a" }]);
    expect(result?.provider).toBe("vertex");
  });

  test("drops empty payloads and citations without a url", () => {
    expect(normalizeSearchResult({})).toBeNull();
    expect(
      normalizeSearchResult({
        answer: "",
        citations: [{ title: "Nope" }],
      })
    ).toBeNull();
  });
});
