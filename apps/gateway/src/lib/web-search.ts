import { execFile } from "node:child_process";
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WebSearchBackend =
  | "vertex_google_search"
  | "google"
  | "google_cli"
  | "google_cse"
  | "tavily"
  | "brave"
  | "serper";

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResult {
  query: string;
  provider: WebSearchBackend;
  results: WebSearchHit[];
  citations: WebSearchHit[];
}

const CONFIG_HINT =
  "Web search is not configured. Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID " +
  "and Application Default Credentials (or VERTEX_API_KEY), " +
  "or GOOGLE_API_KEY / GEMINI_API_KEY, or install the Gemini CLI (`gemini`), " +
  "or set GOOGLE_CSE_ID with GOOGLE_SEARCH_API_KEY, " +
  "or TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, or SERPER_API_KEY.";

export class WebSearchNotConfiguredError extends Error {
  constructor(message = CONFIG_HINT) {
    super(message);
    this.name = "WebSearchNotConfiguredError";
  }
}

export class WebSearchProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebSearchProviderError";
  }
}

const DEFAULT_MAX = 5;
const HARD_MAX = 10;
const CLI_TIMEOUT_MS = 45_000;
const HTTP_TIMEOUT_MS = 20_000;
const VERTEX_TIMEOUT_MS = 30_000;
const METADATA_TIMEOUT_MS = 1_500;
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

let cachedCliBinary: string | null | undefined;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

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

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function googleApiKey(): string {
  return env("GOOGLE_SEARCH_API_KEY") || env("GOOGLE_API_KEY") || env("GEMINI_API_KEY");
}

function googleCseId(): string {
  return env("GOOGLE_CSE_ID") || env("GOOGLE_SEARCH_CX") || env("GOOGLE_SEARCH_ENGINE_ID");
}

function vertexProjectId(): string {
  return env("GOOGLE_CLOUD_PROJECT") || env("GCP_PROJECT") || env("GCP_PROJECT_ID");
}

function vertexLocation(): string {
  return env("VERTEX_LOCATION") || env("GOOGLE_CLOUD_LOCATION") || "global";
}

function vertexSearchModel(): string {
  return env("VERTEX_SEARCH_MODEL") || "gemini-2.5-flash";
}

function vertexConfigured(): boolean {
  return Boolean(
    vertexProjectId() || env("VERTEX_API_KEY") || env("GOOGLE_APPLICATION_CREDENTIALS")
  );
}

function runningOnGcp(): boolean {
  return Boolean(env("K_SERVICE") || env("CLOUD_RUN_JOB") || env("FUNCTION_TARGET") || env("K_REVISION"));
}

function clampMax(maxResults?: number): number {
  if (typeof maxResults !== "number" || !Number.isFinite(maxResults)) return DEFAULT_MAX;
  return Math.min(HARD_MAX, Math.max(1, Math.floor(maxResults)));
}

function asHits(hits: WebSearchHit[]): WebSearchHit[] {
  return hits.filter((h) => /^https?:\/\//i.test(h.url));
}

function hostnameTitle(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function commandOnPath(bin: string): Promise<boolean> {
  if (!bin || /[\\/]/.test(bin)) return false;
  try {
    await execFileAsync("which", [bin], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function resolveGoogleCliBinary(): Promise<string | null> {
  if (env("GOOGLE_SEARCH_DISABLE_CLI") === "1") return null;
  const explicit = env("GOOGLE_CLI") || env("GEMINI_CLI");
  if (explicit) return explicit;
  if (cachedCliBinary !== undefined) return cachedCliBinary;
  cachedCliBinary = (await commandOnPath("gemini")) ? "gemini" : null;
  return cachedCliBinary;
}

function syncBackends(): WebSearchBackend[] {
  const out: WebSearchBackend[] = [];
  if (vertexConfigured()) out.push("vertex_google_search");
  if (googleApiKey()) out.push("google");
  if (env("GOOGLE_CLI") || env("GEMINI_CLI")) out.push("google_cli");
  if (googleCseId() && googleApiKey()) out.push("google_cse");
  if (env("TAVILY_API_KEY")) out.push("tavily");
  if (env("BRAVE_SEARCH_API_KEY")) out.push("brave");
  if (env("SERPER_API_KEY")) out.push("serper");
  return out;
}

/** First configured backend (sync). Does not probe PATH for `gemini` or ADC. */
export function configuredWebSearchBackend(): WebSearchBackend | null {
  return syncBackends()[0] ?? null;
}

export async function configuredWebSearchBackends(): Promise<WebSearchBackend[]> {
  const out = syncBackends();
  if (out[0] === "vertex_google_search" && !env("VERTEX_API_KEY")) {
    const token = await getGcpAccessToken();
    if (!token) out.shift();
  }
  if (!out.includes("google_cli") && (await resolveGoogleCliBinary())) {
    let i = 0;
    if (out[i] === "vertex_google_search") i++;
    if (out[i] === "google") i++;
    out.splice(i, 0, "google_cli");
  }
  return out;
}

function adcFilePath(): string {
  const explicit = env("GOOGLE_APPLICATION_CREDENTIALS");
  if (explicit) return explicit;
  if (process.platform === "win32") {
    return join(env("APPDATA") || join(homedir(), "AppData", "Roaming"), "gcloud", "application_default_credentials.json");
  }
  return join(homedir(), ".config", "gcloud", "application_default_credentials.json");
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
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    return cacheAccessToken(data.access_token, data.expires_in ?? 3600);
  } catch {
    return null;
  }
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
    })
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
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
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
      })
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
      })
    );
  }
  return null;
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

export async function getGcpAccessToken(): Promise<string | null> {
  const explicit = env("VERTEX_ACCESS_TOKEN") || env("GOOGLE_ACCESS_TOKEN");
  if (explicit) return explicit;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  return (
    (await tokenFromMetadata()) ||
    (await tokenFromAdcFile()) ||
    (await tokenFromGcloud())
  );
}

function vertexGenerateUrl(project: string, location: string, model: string, apiKey: string): string {
  const loc = location || "global";
  const host = loc === "global" ? "https://aiplatform.googleapis.com" : `https://${loc}-aiplatform.googleapis.com`;
  if (project) {
    const path = `/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(loc)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
    return apiKey ? `${host}${path}?key=${encodeURIComponent(apiKey)}` : `${host}${path}`;
  }
  return `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through */
    }
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function hitsFromUnknown(value: unknown, maxResults: number): WebSearchHit[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return asHits(
      value.map((row) => {
        const r = row as Record<string, unknown>;
        const url = String(r.url || r.link || r.uri || "");
        return {
          title: String(r.title || hostnameTitle(url)),
          url,
          snippet: String(r.snippet || r.content || r.description || ""),
        };
      })
    ).slice(0, maxResults);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["results", "citations", "sources", "organic"]) {
      const hits = hitsFromUnknown(obj[key], maxResults);
      if (hits.length) return hits;
    }
    if (typeof obj.response === "string") {
      return hitsFromText(obj.response, maxResults);
    }
  }
  return [];
}

function hitsFromText(text: string, maxResults: number): WebSearchHit[] {
  const fromJson = hitsFromUnknown(extractJsonObject(text), maxResults);
  if (fromJson.length) return fromJson;

  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();
  const md = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = md.exec(text)) && hits.length < maxResults) {
    const url = match[2];
    if (seen.has(url)) continue;
    seen.add(url);
    hits.push({ title: match[1].trim() || hostnameTitle(url), url, snippet: "" });
  }
  const raw = text.match(/https?:\/\/[^\s)\]>'"]+/g) || [];
  for (const url of raw) {
    if (hits.length >= maxResults) break;
    if (seen.has(url)) continue;
    seen.add(url);
    hits.push({ title: hostnameTitle(url), url, snippet: "" });
  }
  return asHits(hits);
}

function hitsFromGrounding(candidate: GroundingCandidate | undefined, maxResults: number): WebSearchHit[] {
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const supports = candidate?.groundingMetadata?.groundingSupports || [];
  const snippetFor = (index: number): string => {
    const hit = supports.find((s) => (s.groundingChunkIndices || []).includes(index));
    return hit?.segment?.text || supports[0]?.segment?.text || "";
  };
  const hits = asHits(
    chunks.map((c, i) => ({
      title: c.web?.title || hostnameTitle(c.web?.uri || ""),
      url: c.web?.uri || "",
      snippet: snippetFor(i),
    }))
  ).slice(0, maxResults);
  if (hits.length) return hits;
  const text = candidate?.content?.parts?.map((p) => p.text || "").join("\n") || "";
  return hitsFromText(text, maxResults);
}

async function searchGoogleCli(query: string, maxResults: number): Promise<WebSearchHit[]> {
  const bin = await resolveGoogleCliBinary();
  if (!bin) {
    throw new WebSearchNotConfiguredError(
      "Gemini CLI not found. Install `@google/gemini-cli` (`gemini`) or set GOOGLE_CLI to the binary path."
    );
  }

  const prompt = [
    `Use the google_web_search tool to search the live web for: ${query}`,
    `Return a JSON object {"results":[{"title":"...","url":"...","snippet":"..."}]} with up to ${maxResults} real citations from that search.`,
    "Do not invent URLs. Do not call any tool except google_web_search.",
  ].join("\n");

  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--approval-mode",
    "yolo",
    "--skip-trust",
    "--allowed-tools",
    "google_web_search",
  ];

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: CLI_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      cwd: tmpdir(),
      env: { ...process.env, NO_COLOR: "1", TERM: "dumb" },
    });
    const parsed = extractJsonObject(stdout);
    if (parsed && typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const err = (parsed as { error?: { message?: string } }).error;
      if (err?.message) {
        throw new WebSearchProviderError(`google_cli: ${err.message}`);
      }
    }
    const hits = hitsFromUnknown(parsed, maxResults);
    if (hits.length) return hits;
    const fromStdout = hitsFromText(stdout, maxResults);
    if (fromStdout.length) return fromStdout;
    throw new WebSearchProviderError(
      `google_cli returned no citations.${stderr ? ` ${stderr.slice(0, 240)}` : ""}`
    );
  } catch (err) {
    if (err instanceof WebSearchProviderError || err instanceof WebSearchNotConfiguredError) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : "Gemini CLI failed";
    throw new WebSearchProviderError(`google_cli failed: ${detail.slice(0, 400)}`);
  }
}

async function postGenerateContent(
  url: string,
  headers: Record<string, string>,
  tools: unknown[],
  query: string,
  timeoutMs: number
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `Search the live web for: ${query}. Cite the sources you used.` }],
        },
      ],
      tools,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function parseGroundingResponse(
  res: Response,
  label: string,
  maxResults: number
): Promise<WebSearchHit[]> {
  if (!res.ok) {
    throw new WebSearchProviderError(`${label} failed (${res.status})`);
  }
  const data = (await res.json()) as {
    candidates?: GroundingCandidate[];
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new WebSearchProviderError(`${label}: ${data.error.message}`);
  }
  const hits = hitsFromGrounding(data.candidates?.[0], maxResults);
  if (hits.length) return hits;
  throw new WebSearchProviderError(`${label} returned no citations`);
}

async function searchVertexGoogleSearch(query: string, maxResults: number): Promise<WebSearchHit[]> {
  const project = vertexProjectId();
  const apiKey = env("VERTEX_API_KEY");
  const token = apiKey ? "" : (await getGcpAccessToken()) || "";
  if (!token && !apiKey) {
    throw new WebSearchNotConfiguredError(
      "Vertex Google Search grounding needs GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials (`gcloud auth application-default login`), or VERTEX_API_KEY."
    );
  }
  if (!project && !apiKey) {
    throw new WebSearchNotConfiguredError(
      "Vertex Google Search grounding needs GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID."
    );
  }

  const url = vertexGenerateUrl(project, vertexLocation(), vertexSearchModel(), apiKey);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const requestOnce = async (): Promise<WebSearchHit[]> => {
    let res = await postGenerateContent(url, headers, [{ googleSearch: {} }], query, VERTEX_TIMEOUT_MS);
    if (res.status === 400) {
      res = await postGenerateContent(url, headers, [{ google_search: {} }], query, VERTEX_TIMEOUT_MS);
    }
    if (res.status === 400) {
      res = await postGenerateContent(
        url,
        headers,
        [{ google_search_retrieval: {} }],
        query,
        VERTEX_TIMEOUT_MS
      );
    }
    return parseGroundingResponse(res, "Vertex Google Search grounding", maxResults);
  };

  try {
    return await requestOnce();
  } catch (err) {
    if (err instanceof WebSearchProviderError && /no citations/i.test(err.message)) {
      return requestOnce();
    }
    throw err;
  }
}

async function searchGoogleGrounding(query: string, maxResults: number): Promise<WebSearchHit[]> {
  const key = googleApiKey();
  if (!key) {
    throw new WebSearchNotConfiguredError(
      "Gemini Google Search grounding needs GOOGLE_API_KEY or GEMINI_API_KEY."
    );
  }
  const model = env("GOOGLE_SEARCH_MODEL") || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const headers = { "Content-Type": "application/json" };

  let res = await postGenerateContent(url, headers, [{ google_search: {} }], query, HTTP_TIMEOUT_MS);
  if (res.status === 400) {
    res = await postGenerateContent(
      url,
      headers,
      [{ google_search_retrieval: {} }],
      query,
      HTTP_TIMEOUT_MS
    );
  }
  return parseGroundingResponse(res, "Google Search grounding", maxResults);
}

async function searchGoogleCse(query: string, maxResults: number): Promise<WebSearchHit[]> {
  const key = googleApiKey();
  const cx = googleCseId();
  if (!key || !cx) {
    throw new WebSearchNotConfiguredError(
      "Google Programmable Search needs GOOGLE_CSE_ID and GOOGLE_SEARCH_API_KEY or GOOGLE_API_KEY."
    );
  }
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("q", query);
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("num", String(maxResults));
  const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (!res.ok) {
    throw new WebSearchProviderError(`Google CSE search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    items?: Array<{ title?: string; link?: string; snippet?: string }>;
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new WebSearchProviderError(`Google CSE: ${data.error.message}`);
  }
  const hits = asHits(
    (data.items || []).map((r) => ({
      title: r.title || r.link || "",
      url: r.link || "",
      snippet: r.snippet || "",
    }))
  );
  if (!hits.length) {
    throw new WebSearchProviderError("Google CSE returned no results");
  }
  return hits;
}

async function searchTavily(query: string, maxResults: number): Promise<WebSearchHit[]> {
  const key = env("TAVILY_API_KEY");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: maxResults,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new WebSearchProviderError(`Tavily search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return asHits(
    (data.results || []).map((r) => ({
      title: r.title || r.url || "",
      url: r.url || "",
      snippet: r.content || "",
    }))
  );
}

async function searchBrave(query: string, maxResults: number): Promise<WebSearchHit[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": env("BRAVE_SEARCH_API_KEY"),
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new WebSearchProviderError(`Brave search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return asHits(
    (data.web?.results || []).map((r) => ({
      title: r.title || r.url || "",
      url: r.url || "",
      snippet: r.description || "",
    }))
  );
}

async function searchSerper(query: string, maxResults: number): Promise<WebSearchHit[]> {
  const res = await fetch("https://api.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": env("SERPER_API_KEY"),
    },
    body: JSON.stringify({ q: query, num: maxResults }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new WebSearchProviderError(`Serper search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return asHits(
    (data.organic || []).map((r) => ({
      title: r.title || r.link || "",
      url: r.link || "",
      snippet: r.snippet || "",
    }))
  );
}

async function searchWith(
  backend: WebSearchBackend,
  query: string,
  maxResults: number
): Promise<WebSearchHit[]> {
  switch (backend) {
    case "vertex_google_search":
      return searchVertexGoogleSearch(query, maxResults);
    case "google":
      return searchGoogleGrounding(query, maxResults);
    case "google_cli":
      return searchGoogleCli(query, maxResults);
    case "google_cse":
      return searchGoogleCse(query, maxResults);
    case "tavily":
      return searchTavily(query, maxResults);
    case "brave":
      return searchBrave(query, maxResults);
    case "serper":
      return searchSerper(query, maxResults);
    default:
      throw new WebSearchNotConfiguredError();
  }
}

/** Live web search. Throws if no provider is configured — never invents results. */
export async function runWebSearch(
  query: string,
  maxResults?: number
): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) {
    throw new Error("query is required");
  }
  const backends = await configuredWebSearchBackends();
  if (!backends.length) {
    throw new WebSearchNotConfiguredError();
  }
  const limit = clampMax(maxResults);
  let lastError: unknown;
  for (const backend of backends) {
    try {
      const results = await searchWith(backend, q, limit);
      if (results.length) {
        return { query: q, provider: backend, results, citations: results };
      }
      lastError = new WebSearchProviderError(`${backend} returned no results`);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof WebSearchNotConfiguredError) throw lastError;
  if (lastError instanceof WebSearchProviderError) throw lastError;
  const message = lastError instanceof Error ? lastError.message : "Web search failed";
  throw new WebSearchProviderError(message);
}
