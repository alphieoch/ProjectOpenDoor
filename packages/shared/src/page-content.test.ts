import { describe, expect, test } from "bun:test";
import { extractPageContent, isGoodPage } from "./page-content";

const BAD_CHROME = `
<html><head><title>All Points East</title></head>
<body>
<a href="#main">Skip to content</a>
<a href="#footer">Skip to footer</a>
<nav>Tickets Home Menu Search</nav>
<p>COOKIE POLICY Terms of use</p>
<p>twitter facebook instagram youtube tiktok</p>
<footer>All rights reserved</footer>
</body></html>
`;

const GOOD_LINEUP = `
<html><head><title>All Points East 2026 lineup</title></head>
<body>
<nav>Tickets Home</nav>
<main>
<h1>All Points East 2026 lineup</h1>
<p>The 2026 bill is headlined by The Strokes, Raye, and Doja Cat across Victoria Park in August.</p>
<p>Lil Baby is not listed on the 2026 lineup. Last year's guests do not automatically return.</p>
<p>Day tickets and weekend tickets go on sale through the official All Points East site.</p>
</main>
</body></html>
`;

describe("page-content extract", () => {
  test("marks skip-link / cookie dumps as BAD", () => {
    const page = extractPageContent(BAD_CHROME, "https://www.allpointseastfestival.com/");
    expect(page.quality).toBe("BAD");
    expect(isGoodPage(page)).toBe(false);
  });

  test("keeps article main as GOOD", () => {
    const page = extractPageContent(GOOD_LINEUP, "https://www.allpointseastfestival.com/lineup");
    expect(page.quality).toBe("GOOD");
    expect(isGoodPage(page)).toBe(true);
    expect(page.text).toMatch(/Lil Baby is not listed/);
    expect(page.text).not.toMatch(/Skip to content/i);
    expect(page.snippet.length).toBeGreaterThan(40);
  });
});
