import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAGE_QUALITY,
  WEB_SEARCH_TOOL_NAME,
  classifyPageQuality,
  formatRagSearchDisplay,
  keepGoodFetchedPages,
  ragSearch,
  setRagSearchRunner,
  stripSkipLinks,
} from "./rag-search";

const SKIP_DUMP =
  "All Points East | Home Skip to content Skip to footer All Points East Festival Tickets Home Tickets 2026 LINEUP";

describe("OpenDoor Search contract", () => {
  test("tool name is web_search — first-party Vertex, no third-party keys", () => {
    expect(WEB_SEARCH_TOOL_NAME).toBe("web_search");
    const src = readFileSync(join(import.meta.dir, "rag-search.ts"), "utf8");
    const barrel = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    expect(src).toContain("vertex_google_search");
    expect(src).toContain("GOOGLE_CLOUD_PROJECT");
    expect(src).toContain("node:child_process");
    expect(src).toContain('import "server-only"');
    expect(barrel).not.toContain("rag-search.ts");
    expect(barrel).not.toMatch(/from ["']\.\/rag-search\.js["']/);
    expect(src).not.toMatch(/env\(\s*["']YOU_COM/);
    expect(src).not.toMatch(/env\(\s*["']BRAVE_SEARCH/);
    expect(src).not.toMatch(/env\(\s*["']SERPER_API/);
    expect(src).not.toMatch(/env\(\s*["']TAVILY/);
  });

  test("PAGE_QUALITY marks skip-link chrome and enablejs interstitials BAD", () => {
    expect(classifyPageQuality(SKIP_DUMP, "https://www.allpointseastfestival.com/")).toBe("BAD");
    expect(
      classifyPageQuality(
        "Please click here if you are not redirected within a few seconds. Enable JavaScript.",
        "https://www.google.com/search?q=Lil+Baby+age",
      ),
    ).toBe("BAD");
    expect(
      classifyPageQuality(
        "Dominique Jones, known professionally as Lil Baby, is an American rapper. He was born on December 3, 1994, in Atlanta, Georgia, and released several studio albums that reached the Billboard 200.",
        "https://en.wikipedia.org/wiki/Lil_Baby",
      ),
    ).toBe("GOOD");
  });

  test("display formatter shows a short answer and citation links — not skip-links", () => {
    const display = formatRagSearchDisplay({
      query: "how old is Lil Baby",
      answer: "Lil Baby is 31 years old (born December 3, 1994).",
      provider: "vertex_google_search",
      citations: [
        {
          title: SKIP_DUMP,
          url: "https://www.allpointseastfestival.com/",
          snippet: SKIP_DUMP,
        },
        {
          title: "Lil Baby",
          url: "https://en.wikipedia.org/wiki/Lil_Baby",
          snippet: "American rapper (born 1994)",
        },
        {
          title: "Lil Baby Biography",
          url: "https://www.biography.com/musicians/lil-baby",
          snippet: "Born December 3, 1994",
        },
      ],
    });
    expect(display).toContain("Lil Baby is 31 years old");
    expect(display).toContain("https://en.wikipedia.org/wiki/Lil_Baby");
    expect(display).toContain("https://www.biography.com/musicians/lil-baby");
    expect(display).not.toMatch(/Skip to content/i);
    expect(display).not.toMatch(/Skip to footer/i);
    expect(display).not.toMatch(/Tickets 2026 LINEUP/i);
    expect(display.split("\n").filter((line) => line.startsWith("- ")).length).toBeGreaterThanOrEqual(2);
    expect(display.split("\n").filter((line) => line.startsWith("- ")).length).toBeLessThanOrEqual(5);
  });

  test("BAD chrome HTML is skipped; GOOD article is cited", () => {
    const citations = keepGoodFetchedPages([
      {
        url: "https://example.com/nav-dump",
        html: `<html><body><a href="#c">Skip to content</a><p>COOKIE POLICY twitter facebook instagram</p></body></html>`,
      },
      {
        url: "https://www.allpointseastfestival.com/lineup",
        html: `<html><head><title>All Points East 2026 lineup</title></head><body><main>
<p>The 2026 bill is headlined by The Strokes, Raye, and Doja Cat across Victoria Park in August.</p>
<p>Lil Baby is not listed on the 2026 lineup. Last year's guests do not automatically return.</p>
<p>Day tickets and weekend tickets go on sale through the official All Points East site.</p>
</main></body></html>`,
      },
    ]);
    expect(citations.map((row) => row.url)).toEqual(["https://www.allpointseastfestival.com/lineup"]);
    expect(citations[0]?.title).toMatch(/All Points East/i);
    expect(citations[0]?.snippet.length).toBeGreaterThan(40);
  });

  test("empty query is 400 and a runner supplies the same citation shape Tools uses", async () => {
    await expect(ragSearch({ query: "   " })).rejects.toMatchObject({ status: 400 });
    setRagSearchRunner(async ({ query }) => ({
      query,
      answer: "Lil Baby is 31.",
      provider: "vertex_google_search",
      citations: [
        { title: "Lil Baby", url: "https://en.wikipedia.org/wiki/Lil_Baby", snippet: "born 1994" },
        { title: "Bio", url: "https://www.biography.com/musicians/lil-baby", snippet: "rapper" },
      ],
    }));
    try {
      const result = await ragSearch("how old is Lil Baby");
      expect(result.provider).toBe("vertex_google_search");
      expect(result.answer).toBe("Lil Baby is 31.");
      expect(result.citations).toEqual([
        { title: "Lil Baby", url: "https://en.wikipedia.org/wiki/Lil_Baby", snippet: "born 1994" },
        { title: "Bio", url: "https://www.biography.com/musicians/lil-baby", snippet: "rapper" },
      ]);
      expect(PAGE_QUALITY.minChars).toBeGreaterThan(0);
      expect(stripSkipLinks(SKIP_DUMP)).not.toMatch(/Skip to content/i);
    } finally {
      setRagSearchRunner(null);
    }
  });
});
