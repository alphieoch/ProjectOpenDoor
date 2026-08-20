/** Keep this file client-safe — do not import the shared barrel (Vertex / node). */
export const SEARCH_TOOL_ID = "search" as const;

export type SearchCitation = {
  title: string;
  url: string;
  snippet?: string;
};

export type SearchInvokeRequest = {
  query: string;
  maxResults?: number;
};

/** Product response for POST /api/tools/search and POST /api/tools/search/invoke. */
export type SearchInvokeSuccess = {
  tool: typeof SEARCH_TOOL_ID;
  query: string;
  answer: string;
  citations: SearchCitation[];
  provider?: string;
  chargedCents: number;
  unlimited: boolean;
  step?: {
    status: "ok";
    text: string;
    results: SearchCitation[];
    citations: SearchCitation[];
    provider?: string;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function citationFromUnknown(value: unknown): SearchCitation | null {
  const row = asRecord(value);
  if (!row) return null;
  const url = typeof row.url === "string" ? row.url.trim() : "";
  if (!url) return null;
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : url;
  const snippet = typeof row.snippet === "string" ? row.snippet : undefined;
  return snippet ? { title, url, snippet } : { title, url };
}

function citationsFromUnknown(value: unknown): SearchCitation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: SearchCitation[] = [];
  for (const item of value) {
    const cite = citationFromUnknown(item);
    if (!cite || seen.has(cite.url)) continue;
    seen.add(cite.url);
    out.push(cite);
  }
  return out;
}

export function normalizeSearchResult(raw: unknown): {
  answer: string;
  citations: SearchCitation[];
  provider?: string;
  query?: string;
} | null {
  const row = asRecord(raw);
  if (!row) return null;
  const step = asRecord(row.step);
  const answer =
    (typeof row.answer === "string" && row.answer.trim()) ||
    (typeof step?.text === "string" && step.text.trim()) ||
    (typeof row.text === "string" && row.text.trim()) ||
    "";
  const citations = citationsFromUnknown(
    row.citations ?? step?.citations ?? step?.results ?? row.results
  );
  if (!answer && citations.length === 0) return null;
  const provider =
    (typeof row.provider === "string" && row.provider) ||
    (typeof step?.provider === "string" && step.provider) ||
    undefined;
  const query =
    (typeof row.query === "string" && row.query) ||
    (typeof step?.query === "string" && step.query) ||
    undefined;
  return { answer, citations, provider, query };
}
