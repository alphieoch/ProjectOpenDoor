import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { trainingJobs, trainingDatasets } from "@opendoor/database";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { enqueueTrainingJob } from "@/lib/training/runner";
import { allowSimulatedTraining, hasRealTrainer } from "@opendoor/shared";

const METHODS = new Set(["sft", "dpo", "orpo", "rft", "grpo"]);

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  try {
    const db = getDb();
    const jobs = await db
      .select()
      .from(trainingJobs)
      .where(eq(trainingJobs.organizationId, orgId))
      .orderBy(desc(trainingJobs.createdAt));
    return NextResponse.json({ jobs });
  } catch (err) {
    console.error("[training/jobs]", err);
    return NextResponse.json({ jobs: [], error: "Failed to load jobs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const method = String(body.method || "sft").toLowerCase();
  const baseModelId = String(body.baseModelId || body.base_model_id || "").trim();
  const datasetId = body.datasetId || body.dataset_id || null;
  const hyperparameters: Record<string, unknown> = body.hyperparameters && typeof body.hyperparameters === "object"
    ? { ...body.hyperparameters }
    : {
        lora: body.lora !== false,
        epochs: body.epochs ?? 3,
        learning_rate: body.learningRate ?? body.learning_rate ?? 0.0001,
        batch_size: body.batchSize ?? body.batch_size ?? 4,
      };
  if (body.plan && typeof body.plan === "object") {
    hyperparameters.plan = body.plan;
  }
  if (typeof body.lora === "boolean") hyperparameters.lora = body.lora;
  if (body.epochs != null) hyperparameters.epochs = body.epochs;
  if (body.learningRate != null || body.learning_rate != null) {
    hyperparameters.learning_rate = body.learningRate ?? body.learning_rate;
  }
  if (body.batchSize != null || body.batch_size != null) {
    hyperparameters.batch_size = body.batchSize ?? body.batch_size;
  }
  if (body.lora_rank != null || body.loraRank != null) {
    hyperparameters.lora_rank = body.lora_rank ?? body.loraRank;
  }

  if (!name || !baseModelId) {
    return NextResponse.json(
      { error: "name and baseModelId are required" },
      { status: 400 }
    );
  }
  if (!METHODS.has(method)) {
    return NextResponse.json(
      { error: `method must be one of ${[...METHODS].join(", ")}` },
      { status: 400 }
    );
  }

  const db = getDb();
  if (datasetId) {
    const ds = await db
      .select()
      .from(trainingDatasets)
      .where(
        and(
          eq(trainingDatasets.id, datasetId),
          eq(trainingDatasets.organizationId, orgId)
        )
      )
      .limit(1);
    if (!ds[0]) {
      return NextResponse.json({ error: "dataset not found" }, { status: 400 });
    }
  }

  const [job] = await db
    .insert(trainingJobs)
    .values({
      organizationId: orgId,
      datasetId,
      name,
      method,
      baseModelId,
      hyperparameters,
      status: "queued",
      statusMessage: "Queued for trainer",
      providerSlug:
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCP_PROJECT ||
        process.env.GCP_PROJECT_ID ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? "vertex"
          : process.env.TOGETHER_API_KEY
            ? "together"
            : process.env.LOCAL_TRAINER_URL
              ? "opendoor-local"
              : allowSimulatedTraining() && !hasRealTrainer()
                ? "opendoor-local"
                : "vertex",
    })
    .returning();

  // Fire-and-forget worker (same process for dashboard API)
  enqueueTrainingJob(job.id).catch((err) => {
    console.error("training enqueue failed", err);
  });

  return NextResponse.json({ job }, { status: 201 });
}
