import { Hono } from "hono";
import { db, batchJobs } from "@opendoor/database";
import { and, desc, eq } from "drizzle-orm";
import { getStoredFile } from "../lib/file-store.js";
import {
  COMPLETION_WINDOW_24H,
  MAX_INLINE_BATCH,
  MAX_STORAGE_BATCH,
  completionWindowOrThrow,
  enqueueBatchJob,
  loadBatchLines,
  normalizeBatchLines,
  persistBatchJsonl,
  toBatchApi,
} from "../lib/batch-worker.js";

const batchesRouter = new Hono();

batchesRouter.post("/", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  let completionWindow: string;
  let expiresAt: Date;
  try {
    ({ completionWindow, expiresAt } = completionWindowOrThrow(body.completion_window));
  } catch (err: any) {
    return c.json({ error: err.message || `completion_window must be ${COMPLETION_WINDOW_24H}` }, 400);
  }

  const inputFileIdRaw =
    typeof body.input_file_id === "string" ? body.input_file_id.trim() : "";
  let lines;
  let inputFileId: string | null = null;
  let storageBacked = false;

  try {
    if (inputFileIdRaw) {
      const meta = await getStoredFile(organization.id, inputFileIdRaw);
      if (!meta) return c.json({ error: "input_file_id not found" }, 404);
      lines = await loadBatchLines({
        organizationId: organization.id,
        inputFileId: inputFileIdRaw,
      });
      inputFileId = inputFileIdRaw;
      storageBacked = true;
    } else {
      lines = normalizeBatchLines(body);
    }
  } catch (err: any) {
    return c.json({ error: err.message || "Invalid batch input" }, 400);
  }

  if (lines.length === 0) {
    return c.json(
      { error: "Provide input_file_id (from POST /v1/files) or requests[] of chat completion bodies" },
      400
    );
  }

  const cap = storageBacked ? MAX_STORAGE_BATCH : MAX_INLINE_BATCH;
  if (lines.length > cap) {
    return c.json(
      {
        error: storageBacked
          ? `Batch is capped at ${MAX_STORAGE_BATCH} requests when using input_file_id`
          : `Batch is capped at ${MAX_INLINE_BATCH} requests in the JSON body. Upload JSONL via POST /v1/files (purpose=batch) and pass input_file_id for up to ${MAX_STORAGE_BATCH}.`,
      },
      400
    );
  }

  if (!inputFileId) {
    try {
      const stored = await persistBatchJsonl({
        organizationId: organization.id,
        filename: "batch-input.jsonl",
        purpose: "batch",
        rows: lines,
      });
      inputFileId = stored.id;
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to store batch input" }, 500);
    }
  }

  const [row] = await db
    .insert(batchJobs)
    .values({
      organizationId: organization.id,
      apiKeyId: apiKey.id,
      endpoint: body.endpoint || lines[0]?.url || "/v1/chat/completions",
      modelId: lines[0]?.body?.model || null,
      status: "pending",
      input: [],
      inputFileId,
      outputFileId: null,
      completionWindow,
      expiresAt,
      totalCount: lines.length,
    })
    .returning();

  enqueueBatchJob({
    jobId: row.id,
    organizationId: organization.id,
    apiKeyId: apiKey.id,
  });

  return c.json(toBatchApi(row), 202);
});

batchesRouter.get("/", async (c) => {
  const organization = c.get("organization");
  const rows = await db
    .select()
    .from(batchJobs)
    .where(eq(batchJobs.organizationId, organization.id))
    .orderBy(desc(batchJobs.createdAt))
    .limit(50);
  return c.json({ object: "list", data: rows.map(toBatchApi) });
});

batchesRouter.get("/:id", async (c) => {
  const organization = c.get("organization");
  const row = await db.query.batchJobs.findFirst({
    where: and(
      eq(batchJobs.id, c.req.param("id")),
      eq(batchJobs.organizationId, organization.id)
    ),
  });
  if (!row) return c.json({ error: "Batch not found" }, 404);
  return c.json(toBatchApi(row));
});

export default batchesRouter;
