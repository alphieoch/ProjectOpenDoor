import { db, batchJobs } from "@opendoor/database";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { BatchRequestLine, ChatCompletionRequest } from "@opendoor/shared";
import { resolveProvider } from "../providers/index.js";
import { calculateCost } from "../utils/pricing.js";
import { debitUsage } from "../utils/billing.js";
import { logGatewayRequest } from "./request-log.js";
import { createStoredFile, getStoredFileBytes } from "./file-store.js";

export const MAX_INLINE_BATCH = 1000;
export const MAX_STORAGE_BATCH = 10_000;
export const BATCH_CONCURRENCY = 8;
export const COMPLETION_WINDOW_24H = "24h";
const WINDOW_MS = 24 * 60 * 60 * 1000;
const PROGRESS_EVERY = 10;

export type BatchQueueItem = {
  jobId: string;
  organizationId: string;
  apiKeyId: string;
};

type OutputLine = {
  id: string;
  custom_id: string;
  response: { status_code: number; body: unknown } | null;
  error: { message: string } | null;
};

const queue: BatchQueueItem[] = [];
let pumping = false;
let recoverStarted = false;
const processStartedAt = new Date();

export function completionWindowOrThrow(raw: unknown): {
  completionWindow: string;
  expiresAt: Date;
} {
  const completionWindow =
    typeof raw === "string" && raw.trim() ? raw.trim() : COMPLETION_WINDOW_24H;
  if (completionWindow !== COMPLETION_WINDOW_24H) {
    throw new Error(`completion_window must be ${COMPLETION_WINDOW_24H}`);
  }
  return { completionWindow, expiresAt: new Date(Date.now() + WINDOW_MS) };
}

function normalizeLine(r: any, i: number): BatchRequestLine {
  const body = (r?.body || r) as ChatCompletionRequest;
  return {
    custom_id: typeof r?.custom_id === "string" && r.custom_id ? r.custom_id : `req-${i}`,
    method: "POST",
    url: typeof r?.url === "string" && r.url ? r.url : "/v1/chat/completions",
    body,
  };
}

export function normalizeBatchLines(body: any): BatchRequestLine[] {
  let lines: BatchRequestLine[] = [];
  if (Array.isArray(body?.requests)) {
    lines = body.requests.map((r: any, i: number) => normalizeLine(r, i + 1));
  } else if (Array.isArray(body?.input)) {
    lines = body.input.map((r: any, i: number) => normalizeLine(r, i + 1));
  }
  return lines.length ? dedupeCustomIds(lines) : lines;
}

export function parseBatchJsonl(text: string): BatchRequestLine[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed);
    if (!Array.isArray(arr)) throw new Error("Expected a JSON array of batch requests");
    return dedupeCustomIds(arr.map((r: any, i: number) => normalizeLine(r, i + 1)));
  }

  if (trimmed.startsWith("{") && !/\r?\n/.test(trimmed)) {
    const obj = JSON.parse(trimmed);
    const fromObj = normalizeBatchLines(obj);
    if (fromObj.length) return dedupeCustomIds(fromObj);
    return dedupeCustomIds([normalizeLine(obj, 1)]);
  }

  const lines: BatchRequestLine[] = [];
  let i = 0;
  for (const raw of trimmed.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) continue;
    i += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(t);
    } catch {
      throw new Error(`Invalid JSON on line ${i}`);
    }
    lines.push(normalizeLine(parsed, i));
  }
  return dedupeCustomIds(lines);
}

function dedupeCustomIds(lines: BatchRequestLine[]): BatchRequestLine[] {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.custom_id)) {
      throw new Error(`Duplicate custom_id: ${line.custom_id}`);
    }
    seen.add(line.custom_id);
  }
  return lines;
}

export function toJsonl(rows: unknown[]): string {
  if (!rows.length) return "";
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

export async function persistBatchJsonl(opts: {
  organizationId: string;
  filename: string;
  purpose: string;
  rows: unknown[];
}) {
  return createStoredFile({
    organizationId: opts.organizationId,
    filename: opts.filename,
    purpose: opts.purpose,
    buf: Buffer.from(toJsonl(opts.rows), "utf8"),
  });
}

export async function loadBatchLines(opts: {
  organizationId: string;
  inputFileId?: string | null;
  fallback?: unknown;
}): Promise<BatchRequestLine[]> {
  if (opts.inputFileId) {
    const file = await getStoredFileBytes(opts.organizationId, opts.inputFileId);
    if (!file) throw new Error("Input file not found");
    return parseBatchJsonl(file.buf.toString("utf8"));
  }
  if (Array.isArray(opts.fallback) && opts.fallback.length) {
    return dedupeCustomIds(
      opts.fallback.map((r: any, i: number) => normalizeLine(r, i + 1))
    );
  }
  return [];
}

function unix(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return Math.floor(new Date(d).getTime() / 1000);
}

export function toBatchApi(row: typeof batchJobs.$inferSelect) {
  const legacyOutput = Array.isArray(row.output) ? row.output : null;
  return {
    id: row.id,
    object: "batch" as const,
    endpoint: row.endpoint,
    status: row.status,
    model: row.modelId,
    input_file_id: row.inputFileId,
    output_file_id: row.outputFileId,
    completion_window: row.completionWindow,
    request_counts: {
      total: row.totalCount,
      completed: row.completedCount,
      failed: row.failedCount,
    },
    output: legacyOutput,
    error: row.error,
    created_at: unix(row.createdAt) ?? 0,
    expires_at: unix(row.expiresAt),
    completed_at: unix(row.completedAt),
  };
}

export function enqueueBatchJob(item: BatchQueueItem) {
  queue.push(item);
  pump();
}

function pump() {
  if (pumping) return;
  pumping = true;
  setImmediate(() => {
    void drain().finally(() => {
      pumping = false;
      if (queue.length) pump();
    });
  });
}

async function drain() {
  while (queue.length) {
    const item = queue.shift()!;
    try {
      await runBatch(item);
    } catch (err: any) {
      console.error("[batches] run failed", err);
      await db
        .update(batchJobs)
        .set({ status: "failed", error: String(err?.message || err) })
        .where(eq(batchJobs.id, item.jobId))
        .catch(() => undefined);
    }
  }
}

function expired(expiresAt: Date | string | null | undefined): boolean {
  return Boolean(expiresAt && Date.now() > new Date(expiresAt).getTime());
}

async function runBatch(item: BatchQueueItem) {
  const { jobId, organizationId, apiKeyId } = item;
  const [claimed] = await db
    .update(batchJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(
      and(
        eq(batchJobs.id, jobId),
        inArray(batchJobs.status, ["pending", "validating"])
      )
    )
    .returning();
  if (!claimed) return;

  if (expired(claimed.expiresAt)) {
    await db
      .update(batchJobs)
      .set({
        status: "expired",
        error: "Batch expired before processing (completion_window 24h)",
        completedAt: new Date(),
      })
      .where(eq(batchJobs.id, jobId));
    return;
  }

  const lines = await loadBatchLines({
    organizationId,
    inputFileId: claimed.inputFileId,
    fallback: claimed.input,
  });
  if (!lines.length) {
    await db
      .update(batchJobs)
      .set({
        status: "failed",
        error: "Input file is empty or unreadable",
        completedAt: new Date(),
      })
      .where(eq(batchJobs.id, jobId));
    return;
  }

  const output: OutputLine[] = new Array(lines.length);
  let completed = 0;
  let failed = 0;
  let stoppedEarly = false;

  async function persistProgress() {
    await db
      .update(batchJobs)
      .set({
        completedCount: completed,
        failedCount: failed,
      })
      .where(eq(batchJobs.id, jobId));
  }

  async function runLine(line: BatchRequestLine, index: number) {
    if (stoppedEarly) return;
    if (expired(claimed.expiresAt)) {
      stoppedEarly = true;
      output[index] = {
        id: `batch_req_${index}`,
        custom_id: line.custom_id,
        response: null,
        error: { message: "Batch expired (completion_window 24h)" },
      };
      failed += 1;
      return;
    }
    try {
      const model = line.body?.model;
      if (!model) throw new Error("Each request body needs a model");
      const resolved = await resolveProvider(model);
      if (!resolved) throw new Error(`Model not found: ${model}`);
      const started = Date.now();
      const response = await resolved.provider.chatCompletion({
        ...line.body,
        model: resolved.model,
        stream: false,
      });
      const promptTokens = response.usage?.prompt_tokens || 0;
      const completionTokens = response.usage?.completion_tokens || 0;
      let costUsd = 0;
      try {
        const cost = await calculateCost({
          providerSlug: resolved.provider.slug,
          modelId: model,
          promptTokens,
          completionTokens,
        });
        const multiplier = 0.5;
        costUsd = cost.totalCost * multiplier;
        await debitUsage(organizationId, costUsd, undefined, {
          plan: "free",
          family: "open_weight",
          providerSlug: resolved.provider.slug,
          useFromPlan: false,
          useFromCredits: true,
        });
      } catch {
        /* optional */
      }
      await logGatewayRequest({
        apiKeyId,
        organizationId,
        providerSlug: resolved.provider.slug,
        modelId: model,
        requestType: "chat",
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - started,
        costUsd,
      });
      output[index] = {
        id: `batch_req_${index}`,
        custom_id: line.custom_id,
        response: { status_code: 200, body: response },
        error: null,
      };
      completed += 1;
    } catch (err: any) {
      output[index] = {
        id: `batch_req_${index}`,
        custom_id: line.custom_id,
        response: null,
        error: { message: err.message || "Request failed" },
      };
      failed += 1;
    }
    if ((completed + failed) % PROGRESS_EVERY === 0) {
      await persistProgress();
    }
  }

  let next = 0;
  async function worker() {
    while (next < lines.length && !stoppedEarly) {
      const index = next++;
      await runLine(lines[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, Math.max(lines.length, 1)) }, () =>
      worker()
    )
  );

  for (let i = 0; i < output.length; i++) {
    if (output[i]) continue;
    const line = lines[i];
    output[i] = {
      id: `batch_req_${i}`,
      custom_id: line?.custom_id || `req-${i + 1}`,
      response: null,
      error: { message: stoppedEarly ? "Batch expired (completion_window 24h)" : "Not processed" },
    };
    failed += 1;
  }

  let outputFileId: string | null = null;
  try {
    const file = await persistBatchJsonl({
      organizationId,
      filename: `batch-${jobId}-output.jsonl`,
      purpose: "batch_output",
      rows: output,
    });
    outputFileId = file.id;
  } catch (err: any) {
    console.error("[batches] output upload failed", err);
  }

  const allFailed = failed === lines.length && lines.length > 0;
  const status = stoppedEarly ? "expired" : allFailed ? "failed" : "completed";
  await db
    .update(batchJobs)
    .set({
      status,
      output: null,
      outputFileId,
      completedCount: completed,
      failedCount: failed,
      completedAt: new Date(),
      error: stoppedEarly
        ? "Batch expired (completion_window 24h)"
        : allFailed
          ? "All requests failed"
          : null,
    })
    .where(eq(batchJobs.id, jobId));
}

async function recoverPendingJobs() {
  try {
    await db
      .update(batchJobs)
      .set({ status: "pending" })
      .where(
        and(
          eq(batchJobs.status, "running"),
          or(isNull(batchJobs.startedAt), lt(batchJobs.startedAt, processStartedAt))
        )
      );
    const rows = await db
      .select({
        id: batchJobs.id,
        organizationId: batchJobs.organizationId,
        apiKeyId: batchJobs.apiKeyId,
      })
      .from(batchJobs)
      .where(inArray(batchJobs.status, ["pending", "validating"]))
      .limit(50);
    for (const row of rows) {
      enqueueBatchJob({
        jobId: row.id,
        organizationId: row.organizationId,
        apiKeyId: row.apiKeyId,
      });
    }
  } catch (err) {
    console.error("[batches] recover failed", err);
  }
}

export function startBatchWorker() {
  if (recoverStarted) return;
  recoverStarted = true;
  setImmediate(() => {
    void recoverPendingJobs();
  });
}
