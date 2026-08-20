import type { ComputerFile } from "./openbot.js";
import type { AgentMemoryItem, AgentWorkspace } from "./agent-workspace.js";

export const MEMORY_KINDS = ["working", "episodic", "semantic", "note"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const RECALL_LIMIT = 8;
export const AGENT_EMBEDDING_MODEL_ENV = "AGENT_EMBEDDING_MODEL";
const MAX_EMBED_DIM = 4096;
const EMBED_BATCH = 12;
const STOP = new Set(["a", "an", "the", "of", "to", "in", "for", "and", "or", "is", "it", "on", "at"]);

export const RECALL_WEIGHTS = {
  withQuery: { lexical: 0.5, kind: 0.25, recency: 0.25 },
  withSimilarity: { lexical: 0.28, kind: 0.16, recency: 0.16, similarity: 0.4 },
  noQuery: { kind: 0.3, recency: 0.7 },
} as const;

export type MemorySource = "memory" | "file";

export type MemoryCandidate = {
  id: string;
  kind: MemoryKind;
  content: string;
  createdAt: string;
  source: MemorySource;
  path?: string;
  embedding?: number[];
};

export type RankedMemoryHit = MemoryCandidate & { score: number };

export type RecallRankOptions = {
  query?: string;
  kind?: MemoryKind;
  limit?: number;
  now?: number;
  similarities?: Record<string, number>;
};

export type RecallOptions = RecallRankOptions & {
  includeFiles?: boolean;
};

export type AgentEmbeddingsClient = {
  model: string;
  embed(texts: string[]): Promise<number[][] | null>;
};

export function parseMemoryKind(value: unknown): MemoryKind | undefined {
  return typeof value === "string" && (MEMORY_KINDS as readonly string[]).includes(value)
    ? (value as MemoryKind)
    : undefined;
}

export function inferMemoryKind(query: string): MemoryKind | undefined {
  const t = new Set(tokens(query));
  for (const kind of MEMORY_KINDS) {
    if (t.has(kind)) return kind;
  }
  if (t.has("preference") || t.has("prefer") || t.has("preferences")) return "semantic";
  if (t.has("yesterday") || t.has("session") || t.has("happened")) return "episodic";
  if (t.has("todo") || t.has("wip")) return "working";
  return undefined;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

export function lexicalScore(content: string, query: string): number {
  const q = query.trim().toLowerCase();
  const c = content.toLowerCase();
  if (!q) return 0;
  if (c.includes(q)) return 1;
  const qTokens = tokens(q);
  if (!qTokens.length) return 0;
  const cTokens = new Set(tokens(c));
  let hits = 0;
  for (const token of qTokens) {
    if (cTokens.has(token) || c.includes(token)) hits += 1;
  }
  return hits / qTokens.length;
}

export function kindScore(kind: MemoryKind, preferred?: MemoryKind): number {
  if (!preferred) return 0.5;
  return kind === preferred ? 1 : 0.15;
}

export function recencyScore(createdAt: string, bounds: { min: number; max: number }): number {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return 0;
  if (bounds.max <= bounds.min) return 1;
  return (t - bounds.min) / (bounds.max - bounds.min);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function readEmbeddingVector(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_EMBED_DIM) return undefined;
  if (!raw.every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
  return raw as number[];
}

export function memoryCandidatesFromWorkspace(
  ws: AgentWorkspace,
  opts?: { includeFiles?: boolean },
): MemoryCandidate[] {
  const notes: MemoryCandidate[] = ws.memory.map((item) => ({
    id: item.id,
    kind: parseMemoryKind(item.kind) || "note",
    content: item.content,
    createdAt: item.createdAt,
    source: "memory",
    embedding: readEmbeddingVector(item.embedding),
  }));
  if (!opts?.includeFiles) return notes;
  const files: MemoryCandidate[] = (ws.computer?.files || []).map((file) => ({
    id: fileCandidateId(file.path),
    kind: "note",
    content: `${file.path}\n${file.content}`.slice(0, 2000),
    createdAt: file.updatedAt,
    source: "file",
    path: file.path,
    embedding: readEmbeddingVector(file.embedding),
  }));
  return [...notes, ...files];
}

export function rankMemoryItems(
  items: MemoryCandidate[],
  opts: RecallRankOptions = {},
): RankedMemoryHit[] {
  const query = (opts.query || "").trim();
  const explicitKind = opts.kind;
  const preferred = explicitKind || (query ? inferMemoryKind(query) : undefined);
  const pool = explicitKind ? items.filter((item) => item.kind === explicitKind) : items;
  const limit = Math.max(1, Math.min(opts.limit ?? RECALL_LIMIT, RECALL_LIMIT));
  const similarities = opts.similarities;
  const hasSimilarity = Boolean(similarities && Object.keys(similarities).length > 0);
  const times = pool.map((item) => Date.parse(item.createdAt)).filter((t) => Number.isFinite(t));
  const bounds = {
    min: times.length ? Math.min(...times) : 0,
    max: times.length ? Math.max(...times) : 0,
  };

  const ranked = pool
    .map((item) => {
      const lexical = query ? lexicalScore(item.content, query) : 0;
      const kind = kindScore(item.kind, preferred);
      const recency = recencyScore(item.createdAt, bounds);
      const similarity = hasSimilarity ? clamp01(similarities?.[item.id] ?? 0) : 0;
      const score = blendScore({ lexical, kind, recency, similarity }, { query: Boolean(query), hasSimilarity });
      return { hit: { ...item, score }, lexical, similarity };
    })
    .sort((a, b) => b.hit.score - a.hit.score || Date.parse(b.hit.createdAt) - Date.parse(a.hit.createdAt) || a.hit.id.localeCompare(b.hit.id));

  const hits = query ? selectUsefulHits(ranked, preferred) : ranked;
  return hits.slice(0, limit).map((row) => row.hit);
}

export function formatRecallHits(hits: RankedMemoryHit[]): string {
  return hits
    .map((hit) => {
      if (hit.source === "file") {
        const body = hit.content.includes("\n") ? hit.content.slice(hit.content.indexOf("\n") + 1) : hit.content;
        return `[file ${hit.path || hit.id}] ${body.slice(0, 800)}`;
      }
      return `[${hit.kind}] ${hit.content}`;
    })
    .join("\n");
}

export function formatPromptMemory(ws: AgentWorkspace, userText?: string, similarities?: Record<string, number>): string {
  const hits = rankMemoryItems(memoryCandidatesFromWorkspace(ws), {
    query: userText,
    similarities,
    limit: RECALL_LIMIT,
  });
  return formatRecallHits(hits) || "(empty)";
}

export async function recallWorkspace(
  ws: AgentWorkspace,
  opts: RecallOptions = {},
  embeddings?: AgentEmbeddingsClient,
): Promise<{ hits: RankedMemoryHit[]; workspace: AgentWorkspace }> {
  const query = (opts.query || "").trim();
  const includeFiles = opts.includeFiles ?? Boolean(query);
  let workspace = ws;
  let similarities: Record<string, number> | undefined;

  if (embeddings) {
    workspace = await embedWorkspaceMissing(workspace, embeddings, { includeFiles });
    if (query) {
      similarities = await similaritiesForQuery(
        memoryCandidatesFromWorkspace(workspace, { includeFiles }),
        query,
        embeddings,
      );
    }
  }

  const hits = rankMemoryItems(memoryCandidatesFromWorkspace(workspace, { includeFiles }), {
    query,
    kind: opts.kind,
    limit: opts.limit,
    now: opts.now,
    similarities,
  });
  return { hits, workspace };
}

export async function rememberWithEmbedding(
  item: AgentMemoryItem,
  embeddings?: AgentEmbeddingsClient,
): Promise<AgentMemoryItem> {
  if (!embeddings) return item;
  const vectors = await embeddings.embed([item.content]);
  const embedding = readEmbeddingVector(vectors?.[0]);
  if (!embedding) return item;
  return {
    ...item,
    embedding,
    embeddingModel: embeddings.model,
    embeddingAt: item.createdAt,
  };
}

export function agentEmbeddingModel(env: Record<string, string | undefined> = processEnv()): string | null {
  const model = env[AGENT_EMBEDDING_MODEL_ENV]?.trim();
  return model || null;
}

export function embeddingsClientFromEnv(opts: {
  baseUrl: string;
  apiKey: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): AgentEmbeddingsClient | undefined {
  const model = agentEmbeddingModel(opts.env);
  if (!model || !opts.baseUrl || !opts.apiKey) return undefined;
  return createGatewayEmbeddingsClient({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    model,
    fetchImpl: opts.fetchImpl,
  });
}

export function createGatewayEmbeddingsClient(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): AgentEmbeddingsClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  return {
    model: opts.model,
    async embed(texts) {
      const input = texts.map((text) => text.slice(0, 4000)).filter(Boolean);
      if (!input.length) return [];
      try {
        const res = await fetchImpl(`${baseUrl}/v1/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
            "X-Data-Class": "internal",
          },
          body: JSON.stringify({
            model: opts.model,
            input: input.length === 1 ? input[0] : input,
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          data?: Array<{ embedding?: number[]; index?: number }>;
        };
        const rows = Array.isArray(data.data) ? [...data.data] : [];
        rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        if (rows.length < input.length) return null;
        const vectors = rows.slice(0, input.length).map((row) => readEmbeddingVector(row.embedding));
        if (vectors.some((vector) => !vector)) return null;
        return vectors as number[][];
      } catch {
        return null;
      }
    },
  };
}

function blendScore(
  parts: { lexical: number; kind: number; recency: number; similarity: number },
  mode: { query: boolean; hasSimilarity: boolean },
): number {
  if (!mode.query) {
    return RECALL_WEIGHTS.noQuery.kind * parts.kind + RECALL_WEIGHTS.noQuery.recency * parts.recency;
  }
  if (mode.hasSimilarity) {
    const w = RECALL_WEIGHTS.withSimilarity;
    return w.lexical * parts.lexical + w.kind * parts.kind + w.recency * parts.recency + w.similarity * parts.similarity;
  }
  const w = RECALL_WEIGHTS.withQuery;
  return w.lexical * parts.lexical + w.kind * parts.kind + w.recency * parts.recency;
}

function selectUsefulHits(
  ranked: Array<{ hit: RankedMemoryHit; lexical: number; similarity: number }>,
  preferred?: MemoryKind,
): Array<{ hit: RankedMemoryHit; lexical: number; similarity: number }> {
  const matched = ranked.filter((row) => row.lexical > 0 || row.similarity > 0.2);
  if (matched.length) return matched;
  if (preferred) return ranked.filter((row) => row.hit.kind === preferred);
  return [];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function fileCandidateId(path: string): string {
  return `file:${path}`;
}

function processEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env || {};
}

async function embedWorkspaceMissing(
  ws: AgentWorkspace,
  embeddings: AgentEmbeddingsClient,
  opts: { includeFiles: boolean },
): Promise<AgentWorkspace> {
  const pendingNotes = ws.memory.filter((item) => !readEmbeddingVector(item.embedding));
  const pendingFiles = opts.includeFiles
    ? (ws.computer?.files || []).filter((file) => !readEmbeddingVector(file.embedding))
    : [];
  const jobs: Array<{ type: "memory"; id: string; text: string } | { type: "file"; path: string; text: string }> = [
    ...pendingNotes.map((item) => ({ type: "memory" as const, id: item.id, text: item.content })),
    ...pendingFiles.map((file) => ({
      type: "file" as const,
      path: file.path,
      text: `${file.path}\n${file.content}`.slice(0, 4000),
    })),
  ].slice(0, EMBED_BATCH);
  if (!jobs.length) return ws;

  const vectors = await embeddings.embed(jobs.map((job) => job.text));
  if (!vectors) return ws;

  const now = new Date().toISOString();
  const notesById = new Map(ws.memory.map((item) => [item.id, item]));
  const filesByPath = new Map((ws.computer?.files || []).map((file) => [file.path, file]));

  jobs.forEach((job, index) => {
    const embedding = readEmbeddingVector(vectors[index]);
    if (!embedding) return;
    if (job.type === "memory") {
      const item = notesById.get(job.id);
      if (item) notesById.set(job.id, withEmbedding(item, embedding, embeddings.model, now));
      return;
    }
    const file = filesByPath.get(job.path);
    if (file) filesByPath.set(job.path, withFileEmbedding(file, embedding, embeddings.model, now));
  });

  return {
    ...ws,
    memory: ws.memory.map((item) => notesById.get(item.id) || item),
    computer: ws.computer
      ? { ...ws.computer, files: ws.computer.files.map((file) => filesByPath.get(file.path) || file) }
      : ws.computer,
  };
}

async function similaritiesForQuery(
  candidates: MemoryCandidate[],
  query: string,
  embeddings: AgentEmbeddingsClient,
): Promise<Record<string, number> | undefined> {
  const queryVectors = await embeddings.embed([query]);
  const queryVector = readEmbeddingVector(queryVectors?.[0]);
  if (!queryVector) return undefined;
  const similarities: Record<string, number> = {};
  let any = false;
  for (const item of candidates) {
    const embedding = readEmbeddingVector(item.embedding);
    if (!embedding) continue;
    similarities[item.id] = clamp01(cosineSimilarity(queryVector, embedding));
    any = true;
  }
  return any ? similarities : undefined;
}

function withEmbedding(
  item: AgentMemoryItem,
  embedding: number[],
  model: string,
  at: string,
): AgentMemoryItem {
  return { ...item, embedding, embeddingModel: model, embeddingAt: at };
}

function withFileEmbedding(
  file: ComputerFile,
  embedding: number[],
  model: string,
  at: string,
): ComputerFile {
  return { ...file, embedding, embeddingModel: model, embeddingAt: at };
}
