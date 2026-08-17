/**
 * Training job runner — Vertex (GCP project + ADC) is the real trainer.
 * Together is optional overflow when TOGETHER_API_KEY is set.
 * Simulated ft: ids are local/dev only and require ALLOW_SIMULATED_TRAINING=1.
 * Production never mints simulated models.
 */
import { getDb } from "@/lib/db";
import {
  trainingJobs,
  trainingDatasets,
  fineTunedModels,
} from "@opendoor/database";
import { allowSimulatedTraining } from "@opendoor/shared";
import { eq } from "drizzle-orm";
import { canStartVertexTrainingJob, startVertexTrainingJob } from "./vertex-jobs";

const running = new Set<string>();

export async function enqueueTrainingJob(jobId: string): Promise<void> {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    await runTrainingJob(jobId);
  } finally {
    running.delete(jobId);
  }
}

async function runTrainingJob(jobId: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(trainingJobs)
    .where(eq(trainingJobs.id, jobId))
    .limit(1);
  if (!job || job.status === "cancelled") return;

  await db
    .update(trainingJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      progressPercent: 5,
      statusMessage: "Starting trainer…",
      updatedAt: new Date(),
    })
    .where(eq(trainingJobs.id, jobId));

  let dataset: typeof trainingDatasets.$inferSelect | null = null;
  if (job.datasetId) {
    const rows = await db
      .select()
      .from(trainingDatasets)
      .where(eq(trainingDatasets.id, job.datasetId))
      .limit(1);
    dataset = rows[0] || null;
  }

  const togetherKey = process.env.TOGETHER_API_KEY;
  if (togetherKey && dataset) {
    try {
      await runTogetherFineTune(job, dataset, togetherKey);
      return;
    } catch (err: any) {
      await db
        .update(trainingJobs)
        .set({
          status: "failed",
          statusMessage: err?.message || "Together fine-tune failed",
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trainingJobs.id, jobId));
      return;
    }
  }

  if (await canStartVertexTrainingJob()) {
    try {
      await startVertexTrainingJob(job, dataset);
      return;
    } catch (err: any) {
      await db
        .update(trainingJobs)
        .set({
          status: "failed",
          statusMessage: err?.message || "Vertex training job failed",
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trainingJobs.id, jobId));
      return;
    }
  }

  if (!allowSimulatedTraining()) {
    await db
      .update(trainingJobs)
      .set({
        status: "failed",
        statusMessage:
          "No trainer configured. Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID with Application Default Credentials for Vertex supervised tuning, or TOGETHER_API_KEY for optional Together fine-tunes. Production never mints simulated ft: models (ALLOW_SIMULATED_TRAINING=1 is local/dev only).",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingJobs.id, jobId));
    return;
  }

  // Local / simulated path — only when ALLOW_SIMULATED_TRAINING=1 and not production
  await simulateProgress(jobId);
  const outputModelId = `ft:${jobId.replace(/-/g, "").slice(0, 20)}`;

  await db.insert(fineTunedModels).values({
    organizationId: job.organizationId,
    trainingJobId: job.id,
    modelId: outputModelId,
    displayName: job.name,
    baseModelId: job.baseModelId,
    providerSlug: togetherKey ? "together" : "opendoor-local",
    status: "active",
    billAsBase: true,
    metadata: {
      method: job.method,
      hyperparameters: job.hyperparameters,
      simulated: !togetherKey,
    },
  });

  await db
    .update(trainingJobs)
    .set({
      status: "succeeded",
      progressPercent: 100,
      outputModelId,
      statusMessage:
        "Completed (simulated). Set GOOGLE_CLOUD_PROJECT + ADC for Vertex, or TOGETHER_API_KEY for optional Together.",
      finishedAt: new Date(),
      result: { outputModelId, billAsBase: true },
      updatedAt: new Date(),
    })
    .where(eq(trainingJobs.id, jobId));
}

async function simulateProgress(jobId: string) {
  const db = getDb();
  for (const p of [20, 45, 70, 90]) {
    await sleep(400);
    await db
      .update(trainingJobs)
      .set({
        progressPercent: p,
        statusMessage: `Training… ${p}%`,
        updatedAt: new Date(),
      })
      .where(eq(trainingJobs.id, jobId));
  }
}

async function runTogetherFineTune(
  job: typeof trainingJobs.$inferSelect,
  dataset: typeof trainingDatasets.$inferSelect,
  apiKey: string
) {
  const db = getDb();
  const base = process.env.TOGETHER_BASE_URL || "https://api.together.xyz";

  // Together expects a file upload + fine-tune create. If we only have inline rows, upload.
  let fileId: string | undefined;
  const inlineRows = (dataset.metadata as any)?.inlineRows as unknown[] | undefined;
  if (inlineRows?.length) {
    const blob = inlineRows.map((r) => JSON.stringify(r)).join("\n");
    const form = new FormData();
    form.append(
      "file",
      new Blob([blob], { type: "application/jsonl" }),
      `${dataset.slug}.jsonl`
    );
    form.append("purpose", "fine-tune");
    form.append("file_type", "jsonl");
    const up = await fetch(`${base}/v1/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!up.ok) {
      throw new Error(`Together file upload failed: ${(await up.text()).slice(0, 500)}`);
    }
    const upJson = await up.json();
    fileId = upJson.id;
  }

  const hp = (job.hyperparameters || {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {
    training_file: fileId || dataset.storageUri,
    model: job.baseModelId,
    n_epochs: hp.epochs ?? 3,
    learning_rate: hp.learning_rate ?? 1e-5,
    batch_size: hp.batch_size ?? 8,
    suffix: job.name.slice(0, 40).replace(/\s+/g, "-"),
  };
  if (hp.lora !== false) {
    body.training_type = "Lora";
    body.lora_rank = hp.lora_rank ?? 8;
  }

  const res = await fetch(`${base}/v1/fine-tunes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Together fine-tune create failed: ${(await res.text()).slice(0, 800)}`);
  }
  const created = await res.json();
  const providerJobId = created.id || created.job_id;

  await db
    .update(trainingJobs)
    .set({
      providerJobId: String(providerJobId),
      providerSlug: "together",
      progressPercent: 15,
      statusMessage: "Together job submitted",
      updatedAt: new Date(),
    })
    .where(eq(trainingJobs.id, job.id));

  // Poll until terminal (cap ~10 min for API handler)
  for (let i = 0; i < 60; i++) {
    await sleep(10_000);
    const st = await fetch(`${base}/v1/fine-tunes/${providerJobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!st.ok) continue;
    const info = await st.json();
    const status = String(info.status || info.job_state || "").toLowerCase();
    const progress = Math.min(95, 15 + i);
    await db
      .update(trainingJobs)
      .set({
        progressPercent: progress,
        statusMessage: `Together: ${status || "running"}`,
        updatedAt: new Date(),
      })
      .where(eq(trainingJobs.id, job.id));

    if (["completed", "succeeded", "success"].includes(status)) {
      const outputModelId =
        info.model_output_name ||
        info.output_name ||
        `ft:${String(providerJobId).slice(0, 24)}`;
      await db.insert(fineTunedModels).values({
        organizationId: job.organizationId,
        trainingJobId: job.id,
        modelId: outputModelId.startsWith("ft:")
          ? outputModelId
          : `ft:${outputModelId}`,
        displayName: job.name,
        baseModelId: job.baseModelId,
        providerSlug: "together",
        status: "active",
        billAsBase: true,
        metadata: { together: info },
      });
      await db
        .update(trainingJobs)
        .set({
          status: "succeeded",
          progressPercent: 100,
          outputModelId: outputModelId.startsWith("ft:")
            ? outputModelId
            : `ft:${outputModelId}`,
          finishedAt: new Date(),
          result: info,
          statusMessage: "Together fine-tune completed",
          updatedAt: new Date(),
        })
        .where(eq(trainingJobs.id, job.id));
      return;
    }
    if (["failed", "cancelled", "error"].includes(status)) {
      throw new Error(`Together job ${status}: ${JSON.stringify(info).slice(0, 400)}`);
    }
  }

  // Leave running — worker/cron can continue; mark as running with provider id
  await db
    .update(trainingJobs)
    .set({
      status: "running",
      statusMessage: "Together job still running — refresh later",
      updatedAt: new Date(),
    })
    .where(eq(trainingJobs.id, job.id));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
