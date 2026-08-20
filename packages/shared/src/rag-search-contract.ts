/**
 * Client-safe OpenDoor Search contract — types, tool name, and display.
 * Vertex / ADC live in rag-search.ts and must not enter the dashboard barrel.
 */

import { extractPageContent, isGoodPage } from "./page-content.js";

export const WEB_SEARCH_TOOL_NAME = "web_search";

export type RagSearchCitation = {
  title: string;
  url: string;
  snippet: string;
};

export type RagSearchResult = {
  query: string;
  answer: string;
  citations: RagSearchCitation[];
  provider: "vertex_google_search";
  orgId?: string;
};

export type RagSearchInput = {
  query: string;
  orgId?: string;
  plan?: string;
  maxResults?: number;
};

export type RagSearchRunner = (input: RagSearchInput) => Promise<RagSearchResult>;

export const PAGE_QUALITY = {
  minChars: 160,
  maxBytes: 512_000,
  fetchTimeoutMs: 8_000,
  skipLinkRe: /\bskip to (content|footer|main|nav|navigation|search)\b/gi,
  chromeRe:
    /\b(enable javascript|please click here if you are not redirected|enablejs|cookie (policy|consent|settings)|accept all cookies)\b/i,
  interstitialHostRe: /consent\.google|(?:^|\/)sorry\//i,
} as const;

export const RAG_SEARCH_DEFAULT_MAX = 5;
export const RAG_SEARCH_HARD_MAX = 8;

const CONFIG_HINT =
  "OpenDoor Search needs GOOGLE_CLOUD_PROJECT (or GCP_PROJECT / GCP_PROJECT_ID) " +
  "and Application Default Credentials on our GCP, or VERTEX_API_KEY / VERTEX_ACCESS_TOKEN.";

export class RagSearchError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "RagSearchError";
    this.status = status;
  }
}

export class RagSearchNotConfiguredError extends RagSearchError {
  constructor(message = CONFIG_HINT) {
    super(message, 503);
    this.name = "RagSearchNotConfiguredError";
  }
}

export function hostnameTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function htmlToReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripSkipLinks(text: string): string {
  return (text || "")
    .replace(PAGE_QUALITY.skipLinkRe, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyPageQuality(text: string, url = ""): "GOOD" | "BAD" {
  const stripped = stripSkipLinks(htmlToReadableText(text));
  if (!stripped || stripped.length < PAGE_QUALITY.minChars) return "BAD";
  if (PAGE_QUALITY.chromeRe.test(stripped)) return "BAD";
  if (url && PAGE_QUALITY.interstitialHostRe.test(url)) return "BAD";
  return "GOOD";
}

export function isSearchToolName(name: string | null | undefined) {
  return (name || "").trim() === WEB_SEARCH_TOOL_NAME;
}

function parseRagPayload(raw: string): RagSearchResult | null {
  const text = raw.trim();
  if (!text.startsWith("{")) return null;
  try {
    const value = JSON.parse(text) as Partial<RagSearchResult>;
    if (!value || typeof value.answer !== "string") return null;
    const citations = Array.isArray(value.citations)
      ? value.citations.filter(
          (row): row is RagSearchCitation =>
            Boolean(row && typeof row.url === "string" && /^https?:\/\//i.test(row.url)),
        )
      : [];
    return {
      query: typeof value.query === "string" ? value.query : "",
      answer: value.answer,
      citations,
      provider: "vertex_google_search",
    };
  } catch {
    return null;
  }
}

export function citationTitle(title: string, url: string): string {
  if (/\bskip to /i.test(title) || PAGE_QUALITY.chromeRe.test(title)) {
    return hostnameTitle(url);
  }
  return stripSkipLinks(title || hostnameTitle(url)) || hostnameTitle(url);
}

export function formatRagSearchDisplay(input: RagSearchResult | string): string {
  const result = typeof input === "string" ? parseRagPayload(input) : input;
  if (!result) {
    return stripSkipLinks(typeof input === "string" ? input : "");
  }
  const answer = stripSkipLinks(result.answer).slice(0, 480);
  const cites = result.citations
    .filter((row) => /^https?:\/\//i.test(row.url) && !PAGE_QUALITY.interstitialHostRe.test(row.url))
    .slice(0, RAG_SEARCH_DEFAULT_MAX)
    .map((row) => `- ${citationTitle(row.title, row.url)}: ${row.url}`);
  return [answer, cites.join("\n")].filter(Boolean).join("\n\n");
}

export function formatRagSearchForModel(result: RagSearchResult): string {
  const cites = result.citations
    .slice(0, RAG_SEARCH_DEFAULT_MAX)
    .map((row, i) => `${i + 1}. ${stripSkipLinks(row.title || hostnameTitle(row.url))}\n   ${row.url}`)
    .join("\n");
  return [`OpenDoor Search for "${result.query}":`, stripSkipLinks(result.answer), cites].filter(Boolean).join("\n\n");
}

/** Drop BAD chrome dumps (skip-links, cookie walls). Used by fetch + tests. */
export function keepGoodFetchedPages(
  rows: Array<{ url: string; html?: string; title?: string; snippet?: string }>,
): RagSearchCitation[] {
  const out: RagSearchCitation[] = [];
  for (const row of rows) {
    if (!row.url || !/^https?:\/\//i.test(row.url)) continue;
    if (typeof row.html === "string" && row.html.trim()) {
      const page = extractPageContent(row.html, row.url);
      if (!isGoodPage(page)) continue;
      out.push({
        title: page.title || row.title || hostnameTitle(row.url),
        url: row.url,
        snippet: page.snippet || row.snippet || "",
      });
      continue;
    }
    if (classifyPageQuality(row.snippet || row.title || "", row.url) === "BAD") continue;
  }
  return out;
}
