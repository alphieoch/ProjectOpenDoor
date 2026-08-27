import "server-only";

/**
 * OpenDoor Search — first-party Path 1 RAG (server-only).
 *
 * Vertex Gemini + Google Search grounding on our GCP. Do not import this file
 * from the @opendoor/shared barrel or any client component. Use
 * `@opendoor/shared/rag-search` or a local server wrapper.
 */

import { createSign } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractPageContent, isGoodPage } from "./page-content.js";
import {
  PAGE_QUALITY,
  RAG_SEARCH_DEFAULT_MAX,
  RAG_SEARCH_HARD_MAX,
  RagSearchError,
  RagSearchNotConfiguredError,
  citationTitle,
  classifyPageQuality,
  hostnameTitle,
  stripSkipLinks,
  type RagSearchCitation,
  type RagSearchInput,
  type RagSearchResult,
  type RagSearchRunner,
} from "./rag-search-contract.js";

export {
  PAGE_QUALITY,
  RAG_SEARCH_DEFAULT_MAX,
  RAG_SEARCH_HARD_MAX,
  RagSearchError,
  RagSearchNotConfiguredError,
  WEB_SEARCH_TOOL_NAME,
  citationTitle,
  classifyPageQuality,
  formatRagSearchDisplay,
  formatRagSearchForModel,
  hostnameTitle,
  htmlToReadableText,
  isSearchToolName,
  keepGoodFetchedPages,
  stripSkipLinks,
  type RagSearchCitation,
  type RagSearchInput,
  type RagSearchResult,
  type RagSearchRunner,
} from "./rag-search-contract.js";

const execFileAsync = promisify(execFile);

const VERTEX_TIMEOUT_MS = 30_000;
const METADATA_TIMEOUT_MS = 1_500;
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

type GroundingCandidate = {
  content?: { parts?: Array<{ text?: string }> };
  groundingMetadata?: {
    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    groundingSupports?: Array<{
      segment?: { text?: string };
      groundingChunkIndices?: number[];
    }>;
  };
};

let runner: RagSearchRunner | null = null;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function clampMax(maxResults?: number): number {
  if (typeof maxResults !== "number" || !Number.isFinite(maxResults)) return RAG_SEARCH_DEFAULT_MAX;
  return Math.min(RAG_SEARCH_HARD_MAX, Math.max(3, Math.floor(maxResults)));
}

function blockedHost(hostname: string) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
  if (h === "::1" || h.startsWith("127.")) return true;
  if (h.startsWith("10.") || h.startsWith("192.168.") || h.startsWith("169.254.")) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;
  return false;
}

/** Tests and a richer sibling engine can replace Vertex I/O without changing the contract. */
export function setRagSearchRunner(next: RagSearchRunner | null) {
  runner = next;
}

function finalize(result: RagSearchResult): RagSearchResult {
  const citations = result.citations
    .filter((row) => /^https?:\/\//i.test(row.url))
    .map((row) => ({
      title: citationTitle(row.title, row.url),
      url: row.url,
      snippet: stripSkipLinks(row.snippet || "").slice(0, 280),
    }))
    .slice(0, RAG_SEARCH_HARD_MAX);
  return {
    query: result.query.trim(),
    answer: stripSkipLinks(result.answer).slice(0, 1200),
    citations,
    provider: "vertex_google_search",
    orgId: result.orgId,
  };
}

function runningOnGcp() {
  return Boolean(env("K_SERVICE") || env("CLOUD_RUN_JOB") || env("FUNCTION_TARGET") || env("K_REVISION"));
}

const DEFAULT_VERTEX_PROJECT = "project-800192c2-3ecc-4889-8f7";

function vertexProjectId() {
  return (
    env("GOOGLE_CLOUD_PROJECT") ||
    env("GCP_PROJECT") ||
    env("GCP_PROJECT_ID") ||
    DEFAULT_VERTEX_PROJECT
  );
}

function vertexLocation() {
  return env("VERTEX_LOCATION") || env("GOOGLE_CLOUD_LOCATION") || "global";
}

function vertexSearchModel() {
  return env("VERTEX_SEARCH_MODEL") || "gemini-2.5-flash";
}

function cacheAccessToken(token: string, expiresInSec: number): string {
  const ttl = Number.isFinite(expiresInSec) ? expiresInSec : 3600;
  cachedAccessToken = { token, expiresAt: Date.now() + Math.max(60, ttl) * 1000 };
  return token;
}

async function tokenFromMetadata(): Promise<string | null> {
  if (!runningOnGcp()) return null;
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    return cacheAccessToken(data.access_token, data.expires_in ?? 3600);
  } catch {
    return null;
  }
}

function adcFilePath(): string {
  const explicit = env("GOOGLE_APPLICATION_CREDENTIALS");
  if (explicit) return explicit;
  if (process.platform === "win32") {
    return join(env("APPDATA") || join(homedir(), "AppData", "Roaming"), "gcloud", "application_default_credentials.json");
  }
  return join(homedir(), ".config", "gcloud", "application_default_credentials.json");
}

function serviceAccountJwt(email: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: email,
      sub: email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: CLOUD_PLATFORM_SCOPE,
    }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, "base64url")}`;
}

async function exchangeOauthToken(body: URLSearchParams): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  return cacheAccessToken(data.access_token, data.expires_in ?? 3600);
}

async function tokenFromAdcFile(): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(adcFilePath(), "utf8");
  } catch {
    return null;
  }
  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const type = String(creds.type || "");
  if (type === "authorized_user") {
    const clientId = String(creds.client_id || "");
    const clientSecret = String(creds.client_secret || "");
    const refreshToken = String(creds.refresh_token || "");
    if (!clientId || !refreshToken) return null;
    return exchangeOauthToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    );
  }
  if (type === "service_account") {
    const email = String(creds.client_email || "");
    const privateKey = String(creds.private_key || "");
    if (!email || !privateKey) return null;
    return exchangeOauthToken(
      new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountJwt(email, privateKey),
      }),
    );
  }
  return null;
}

async function getVertexAccessToken(): Promise<string | null> {
  const explicit = env("VERTEX_ACCESS_TOKEN") || env("GOOGLE_ACCESS_TOKEN");
  if (explicit) return explicit;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  return (await tokenFromMetadata()) || (await tokenFromAdcFile()) || (await tokenFromGcloud());
}

async function tokenFromGcloud(): Promise<string | null> {
  for (const args of [
    ["auth", "application-default", "print-access-token"],
    ["auth", "print-access-token"],
  ]) {
    try {
      const { stdout } = await execFileAsync("gcloud", args, { timeout: 12_000 });
      const token = stdout.trim().split(/\s+/)[0] || "";
      if (token && token.length > 20) return cacheAccessToken(token, 3300);
    } catch {
      /* try next */
    }
  }
  return null;
}

function vertexGenerateUrl(project: string, location: string, model: string, apiKey: string): string {
  const loc = location || "global";
  const host = loc === "global" ? "https://aiplatform.googleapis.com" : `https://${loc}-aiplatform.googleapis.com`;
  const path = project
    ? `/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(loc)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
    : `/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  return apiKey ? `${host}${path}?key=${encodeURIComponent(apiKey)}` : `${host}${path}`;
}

function citationsFromGrounding(candidate: GroundingCandidate | undefined, maxResults: number): RagSearchCitation[] {
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const supports = candidate?.groundingMetadata?.groundingSupports || [];
  const snippetFor = (index: number): string => {
    const hit = supports.find((row) => (row.groundingChunkIndices || []).includes(index));
    return hit?.segment?.text || supports[0]?.segment?.text || "";
  };
  const seen = new Set<string>();
  const hits: RagSearchCitation[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const url = chunk.web?.uri || "";
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    hits.push({
      title: chunk.web?.title || hostnameTitle(url),
      url,
      snippet: snippetFor(i),
    });
    if (hits.length >= maxResults) break;
  }
  return hits;
}

async function fetchCitedPage(url: string): Promise<{ title: string; text: string; snippet: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (blockedHost(parsed.hostname)) return null;
  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_QUALITY.fetchTimeoutMs),
      headers: { "User-Agent": "OpenDoor-Search/1.0", Accept: "text/html,text/plain;q=0.9" },
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > PAGE_QUALITY.maxBytes) return null;
    const html = new TextDecoder().decode(buf);
    const extracted = extractPageContent(html, parsed.toString());
    if (!isGoodPage(extracted)) return null;
    return { title: extracted.title, text: extracted.text, snippet: extracted.snippet };
  } catch {
    return null;
  }
}

async function applyPageQuality(citations: RagSearchCitation[], maxResults: number): Promise<RagSearchCitation[]> {
  const good: RagSearchCitation[] = [];
  for (const hit of citations.slice(0, RAG_SEARCH_HARD_MAX)) {
    const page = await fetchCitedPage(hit.url);
    if (page) {
      good.push({
        title: stripSkipLinks(hit.title || page.title || hostnameTitle(hit.url)),
        url: hit.url,
        snippet: stripSkipLinks(page.snippet || page.text).slice(0, 280),
      });
    } else if (classifyPageQuality(hit.snippet || hit.title, hit.url) === "GOOD") {
      good.push({
        title: stripSkipLinks(hit.title || hostnameTitle(hit.url)),
        url: hit.url,
        snippet: stripSkipLinks(hit.snippet),
      });
    }
    if (good.length >= maxResults) break;
  }
  return good;
}

async function mergeDiscoveryCitations(
  hits: RagSearchCitation[],
  query: string,
  maxResults: number,
  token: string,
): Promise<RagSearchCitation[]> {
  const extra = await searchVertexAiSearch(query, maxResults, token);
  if (!extra.length) return hits;
  const seen = new Set(hits.map((row) => row.url));
  const merged = [...hits];
  for (const hit of extra) {
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);
    merged.push(hit);
    if (merged.length >= maxResults) break;
  }
  return merged;
}

/** Optional Vertex AI Search (Discovery Engine) — only when VERTEX_SEARCH_ENGINE_ID or VERTEX_DATA_STORE_ID is set. */
async function searchVertexAiSearch(
  query: string,
  maxResults: number,
  token: string,
): Promise<RagSearchCitation[]> {
  const project = vertexProjectId();
  const engine = env("VERTEX_SEARCH_ENGINE_ID");
  const dataStore = env("VERTEX_DATA_STORE_ID");
  if (!project || !token || (!engine && !dataStore)) return [];
  const loc = env("VERTEX_SEARCH_LOCATION") || "global";
  const resource = engine
    ? `projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(loc)}/collections/default_collection/engines/${encodeURIComponent(engine)}/servingConfigs/default_search:search`
    : `projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(loc)}/collections/default_collection/dataStores/${encodeURIComponent(dataStore)}/servingConfigs/default_search:search`;
  try {
    const res = await fetch(`https://discoveryengine.googleapis.com/v1/${resource}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, pageSize: maxResults }),
      signal: AbortSignal.timeout(VERTEX_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        document?: {
          derivedStructData?: { link?: string; title?: string; snippets?: Array<{ snippet?: string }> };
        };
      }>;
    };
    return (data.results || [])
      .map((row) => {
        const doc = row.document?.derivedStructData;
        const url = doc?.link || "";
        return {
          title: doc?.title || hostnameTitle(url),
          url,
          snippet: doc?.snippets?.[0]?.snippet || "",
        };
      })
      .filter((row) => /^https?:\/\//i.test(row.url));
  } catch {
    return [];
  }
}

async function runVertexGroundedSearch(input: RagSearchInput): Promise<RagSearchResult> {
  const query = input.query.trim();
  const maxResults = clampMax(input.maxResults);
  const project = vertexProjectId();
  const apiKey = env("VERTEX_API_KEY");
  const token = apiKey ? "" : (await getVertexAccessToken()) || "";
  if (!token && !apiKey) {
    throw new RagSearchNotConfiguredError();
  }
  if (!project && !apiKey) {
    throw new RagSearchNotConfiguredError();
  }

  const url = vertexGenerateUrl(project, vertexLocation(), vertexSearchModel(), apiKey);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (project) headers["x-goog-user-project"] = project;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `Answer this using live Google Search grounding: ${query}`,
              "Write a short factual answer (2–4 sentences).",
              "Cite only real sources from grounding. Do not invent URLs.",
            ].join(" "),
          },
        ],
      },
    ],
    tools: [{ googleSearch: {} }],
  };

  let res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(VERTEX_TIMEOUT_MS),
  });
  if (res.status === 400) {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, tools: [{ google_search: {} }] }),
      signal: AbortSignal.timeout(VERTEX_TIMEOUT_MS),
    });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RagSearchError(
      `Vertex Google Search grounding failed (${res.status})${detail ? `: ${detail.slice(0, 400)}` : ""}`
    );
  }
  const data = (await res.json()) as {
    candidates?: GroundingCandidate[];
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new RagSearchError(`Vertex Google Search grounding: ${data.error.message}`);
  }
  const candidate = data.candidates?.[0];
  const answer = (candidate?.content?.parts || []).map((part) => part.text || "").join("\n").trim();
  const citations = await mergeDiscoveryCitations(
    citationsFromGrounding(candidate, maxResults),
    query,
    maxResults,
    token,
  );
  if (!answer && !citations.length) {
    throw new RagSearchError("Vertex Google Search grounding returned no answer");
  }
  const qualityCitations = citations.length ? await applyPageQuality(citations, maxResults) : [];
  return {
    query,
    answer: answer || qualityCitations[0]?.snippet || "No synthesized answer.",
    citations: qualityCitations,
    provider: "vertex_google_search",
    orgId: input.orgId,
  };
}

export async function ragSearch(query: string): Promise<RagSearchResult>;
export async function ragSearch(input: RagSearchInput): Promise<RagSearchResult>;
export async function ragSearch(input: string | RagSearchInput): Promise<RagSearchResult> {
  const parsed = typeof input === "string" ? { query: input } : input;
  const query = (parsed.query || "").trim();
  if (!query) throw new RagSearchError("query is required", 400);
  const next = { ...parsed, query };
  const result = runner ? await runner(next) : await runVertexGroundedSearch(next);
  return finalize({ ...result, orgId: parsed.orgId ?? result.orgId });
}
