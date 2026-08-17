import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, trainingDatasets, trainingJobs } from "@opendoor/database";
import { asString, requireTenant, slugify, uniqueConflict, writeAudit } from "../lib/platform.js";

const trainingRouter = new Hono();
const METHODS = new Set(["sft", "dpo", "orpo", "rft", "grpo"]);
const PURPOSES = new Set(["sft", "dpo", "orpo", "eval"]);

trainingRouter.get("/datasets", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(trainingDatasets)
    .where(eq(trainingDatasets.organizationId, tenant.organization.id))
    .orderBy(desc(trainingDatasets.createdAt));
  return c.json({ object: "list", data: rows });
});

trainingRouter.post("/datasets", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name);
  if (!name) return c.json({ error: "name is required" }, 400);
  const purpose = asString(body.purpose) || "sft";
  if (!PURPOSES.has(purpose)) return c.json({ error: "purpose must be sft|dpo|orpo|eval" }, 400);
  const rows = Array.isArray(body.rows) ? body.rows : null;
  const storageUri = asString(body.storageUri || body.storage_uri) || null;
  if (!rows && !storageUri) {
    return c.json({ error: "Provide rows[] or storageUri" }, 400);
  }
  let rowCount = Number(body.rowCount || 0);
  let byteSize = Number(body.byteSize || 0);
  let sample: unknown = body.sample ?? null;
  let resolvedUri = storageUri;
  if (rows) {
    rowCount = rows.length;
    const payload = rows.map((r: unknown) => JSON.stringify(r)).join("\n");
    byteSize = Buffer.byteLength(payload, "utf8");
    sample = rows.slice(0, 3);
    if (byteSize > 2_000_000 && !storageUri) {
      return c.json({ error: "Dataset > 2MB — upload to GCS and pass storageUri" }, 400);
    }
    if (!resolvedUri) resolvedUri = `inline:jsonl:${slugify(name)}`;
  }
  try {
    const [dataset] = await db
      .insert(trainingDatasets)
      .values({
        organizationId: tenant.organization.id,
        name,
        slug: slugify(asString(body.slug) || name),
        format: asString(body.format) || "jsonl",
        purpose,
        storageUri: resolvedUri,
        rowCount,
        byteSize,
        status: "ready",
        sample,
        metadata: rows ? { inlineRows: rows.length <= 500 ? rows : undefined } : {},
      })
      .returning();
    await writeAudit({
      organizationId: tenant.organization.id,
      action: "training.dataset.created",
      entityType: "training_dataset",
      entityId: dataset.id,
    });
    return c.json({ object: "training.dataset", ...dataset }, 201);
  } catch (err) {
    if (uniqueConflict(err)) return c.json({ error: "slug already exists" }, 409);
    throw err;
  }
});

trainingRouter.get("/datasets/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [row] = await db
    .select()
    .from(trainingDatasets)
    .where(
      and(eq(trainingDatasets.id, c.req.param("id")), eq(trainingDatasets.organizationId, tenant.organization.id))
    )
    .limit(1);
  if (!row) return c.json({ error: "Dataset not found" }, 404);
  return c.json({ object: "training.dataset", ...row });
});

trainingRouter.get("/jobs", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(trainingJobs)
    .where(eq(trainingJobs.organizationId, tenant.organization.id))
    .orderBy(desc(trainingJobs.createdAt));
  return c.json({ object: "list", data: rows });
});

trainingRouter.post("/jobs", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = asString(body.name);
  const baseModelId = asString(body.baseModelId || body.base_model_id);
  const method = (asString(body.method) || "sft").toLowerCase();
  if (!name || !baseModelId) return c.json({ error: "name and baseModelId are required" }, 400);
  if (!METHODS.has(method)) return c.json({ error: `method must be one of ${[...METHODS].join(", ")}` }, 400);
  const datasetId = asString(body.datasetId || body.dataset_id) || null;
  if (datasetId) {
    const [ds] = await db
      .select({ id: trainingDatasets.id })
      .from(trainingDatasets)
      .where(and(eq(trainingDatasets.id, datasetId), eq(trainingDatasets.organizationId, tenant.organization.id)))
      .limit(1);
    if (!ds) return c.json({ error: "dataset not found" }, 400);
  }
  const [job] = await db
    .insert(trainingJobs)
    .values({
      organizationId: tenant.organization.id,
      datasetId,
      name,
      method,
      baseModelId,
      hyperparameters: body.hyperparameters || {
        lora: body.lora !== false,
        epochs: body.epochs ?? 3,
        learning_rate: body.learningRate ?? body.learning_rate ?? 0.0001,
        batch_size: body.batchSize ?? body.batch_size ?? 4,
      },
      status: "queued",
      statusMessage: "Queued for trainer",
      providerSlug: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT ? "vertex" : "together",
    })
    .returning();
  await writeAudit({
    organizationId: tenant.organization.id,
    action: "training.job.created",
    entityType: "training_job",
    entityId: job.id,
    metadata: { name, method, baseModelId },
  });
  return c.json({ object: "training.job", ...job }, 201);
});

trainingRouter.get("/jobs/:id", async (c) => {
  const tenant = requireTenant(c);
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const [row] = await db
    .select()
    .from(trainingJobs)
    .where(and(eq(trainingJobs.id, c.req.param("id")), eq(trainingJobs.organizationId, tenant.organization.id)))
    .limit(1);
  if (!row) return c.json({ error: "Job not found" }, 404);
  return c.json({ object: "training.job", ...row });
});

export default trainingRouter;
