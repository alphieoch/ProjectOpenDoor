/**
 * Vertex AI trainer — Supervised Tuning (Gemini / Gemma SFT) or CustomJob.
 *
 * APIs (REST v1 + ADC, same token pattern as dashboard web-search / gateway GCS):
 *   POST/GET https://{region}-aiplatform.googleapis.com/v1/projects/{p}/locations/{r}/tuningJobs
 *   POST/GET https://{region}-aiplatform.googleapis.com/v1/projects/{p}/locations/{r}/customJobs
 *
 * Docs:
 *   https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-use-supervised-tuning
 *   https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.tuningJobs
 *   https://cloud.google.com/vertex-ai/docs/reference/rest/v1/projects.locations.customJobs
 *
 * Does not mint ft: ids unless Vertex reports JOB_STATE_SUCCEEDED and returns a tuned model.
 */
import { execFile } from "node:child_process";
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getDb } from "@/lib/db";
import {
  trainingJobs,
  trainingDatasets,
  fineTunedModels,
} from "@opendoor/database";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

const HTTP_TIMEOUT_MS = 30_000;
const METADATA_TIMEOUT_MS = 1_500;
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const POLL_MS = 10_000;
const POLL_ATTEMPTS = 60;

type TrainingJobRow = typeof trainingJobs.$inferSelect;
type DatasetRow = typeof trainingDatasets.$inferSelect;

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function vertexTrainingProjectId(): string {
  return env("GOOGLE_CLOUD_PROJECT") || env("GCP_PROJECT") || env("GCP_PROJECT_ID");
}

/** Tuning is regional — `global` is inference-only. */
export function vertexTuningLocation(): string {
  const explicit = env("VERTEX_TUNING_LOCATION") || env("VERTEX_TRAINING_LOCATION");
  if (explicit) return explicit;
  const loc = env("VERTEX_LOCATION") || env("GOOGLE_CLOUD_LOCATION") || env("GCP_REGION");
  if (loc && loc !== "global") return loc;
  return "us-central1";
}

function runningOnGcp(): boolean {
  return Boolean(
    env("K_SERVICE") || env("CLOUD_RUN_JOB") || env("FUNCTION_TARGET") || env("K_REVISION")
  );
}

function tuningBucket(): string {
  return env("VERTEX_TUNING_BUCKET") || env("OPENDOOR_FILES_BUCKET") || env("GCS_FILES_BUCKET") || env("GCS_BUCKET");
}

function customTrainingImage(): string {
  const image = env("VERTEX_CUSTOM_TRAINING_IMAGE");
  if (image) return image;
  const endpoint = env("GCP_TRAINER_ENDPOINT");
  if (endpoint && !/^https?:\/\//i.test(endpoint)) return endpoint;
  return "";
}

function aiPlatformHost(location: string): string {
  return `https://${location}-aiplatform.googleapis.com`;
}

function cacheAccessToken(token: string, expiresInSec: number): string {
  const ttl = Number.isFinite(expiresInSec) ? expiresInSec : 3600;
  cachedAccessToken = { token, expiresAt: Date.now() + Math.max(60, ttl) * 1000 };
  return token;
}

function adcFilePath(): string {
  const explicit = env("GOOGLE_APPLICATION_CREDENTIALS");
  if (explicit) return explicit;
  if (process.platform === "win32") {
    return join(
      env("APPDATA") || join(homedir(), "AppData", "Roaming"),
      "gcloud",
      "application_default_credentials.json"
    );
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

/** Same ADC chain as dashboard web-search / gateway GCS. */
export async function getGcpAccessToken(): Promise<string | null> {
  const explicit = env("VERTEX_ACCESS_TOKEN") || env("GOOGLE_ACCESS_TOKEN");
  if (explicit) return explicit;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  return (await tokenFromMetadata()) || (await tokenFromAdcFile()) || (await tokenFromGcloud());
}

export async function canStartVertexTrainingJob(): Promise<boolean> {
  if (!vertexTrainingProjectId()) return false;
  return Boolean(await getGcpAccessToken());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jobState(info: Record<string, unknown>): string {
  return String(info.state || info.status || "").toUpperCase();
}

function isRunningState(state: string): boolean {
  return [
    "JOB_STATE_UNSPECIFIED",
    "JOB_STATE_QUEUED",
    "JOB_STATE_PENDING",
    "JOB_STATE_RUNNING",
    "JOB_STATE_UPDATING",
    "QUEUED",
    "PENDING",
    "RUNNING",
  ].includes(state);
}

function isSuccessState(state: string): boolean {
  return ["JOB_STATE_SUCCEEDED", "JOB_STATE_PARTIALLY_SUCCEEDED", "SUCCEEDED", "SUCCESS"].includes(
    state
  );
}

function isFailedState(state: string): boolean {
  return [
    "JOB_STATE_FAILED",
    "JOB_STATE_CANCELLED",
    "JOB_STATE_EXPIRED",
    "FAILED",
    "CANCELLED",
    "CANCELED",
    "EXPIRED",
    "ERROR",
  ].includes(state);
}

function textPart(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        const rec = asRecord(p);
        return String(rec.text || rec.content || "");
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    const rec = asRecord(content);
    return String(rec.text || rec.content || JSON.stringify(content));
  }
  return content == null ? "" : JSON.stringify(content);
}

/** Convert OpenDoor `{messages}` rows to Vertex SFT `{contents}` JSONL when needed. */
function toGeminiSftLine(row: unknown): string {
  const rec = asRecord(row);
  if (Array.isArray(rec.contents)) return JSON.stringify(row);
  const messages = rec.messages;
  if (!Array.isArray(messages)) return JSON.stringify(row);
  const systemTexts: string[] = [];
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const raw of messages) {
    const m = asRecord(raw);
    const role = String(m.role || "user");
    const text = textPart(m.content ?? m.parts);
    if (role === "system") {
      systemTexts.push(text);
      continue;
    }
    contents.push({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }
  const out: Record<string, unknown> = { contents };
  if (systemTexts.length) {
    out.systemInstruction = { parts: [{ text: systemTexts.join("\n") }] };
  }
  return JSON.stringify(out);
}

function inlineRows(dataset: DatasetRow): unknown[] {
  const meta = asRecord(dataset.metadata);
  return Array.isArray(meta.inlineRows) ? meta.inlineRows : [];
}

function adapterSize(hp: Record<string, unknown>): string | undefined {
  const rank = Number(hp.lora_rank ?? hp.adapter_size ?? hp.adapterSize);
  if (!Number.isFinite(rank) || rank <= 0) return undefined;
  if (rank <= 1) return "ADAPTER_SIZE_ONE";
  if (rank <= 2) return "ADAPTER_SIZE_TWO";
  if (rank <= 4) return "ADAPTER_SIZE_FOUR";
  if (rank <= 8) return "ADAPTER_SIZE_EIGHT";
  if (rank <= 16) return "ADAPTER_SIZE_SIXTEEN";
  return "ADAPTER_SIZE_THIRTY_TWO";
}

function vertexBaseModel(baseModelId: string): string {
  return baseModelId.replace(/^google\//, "").trim();
}

function isGeminiOrGemma(baseModelId: string): boolean {
  const id = vertexBaseModel(baseModelId).toLowerCase();
  return id.startsWith("gemini") || id.startsWith("gemma") || id.includes("gemma-");
}

function usesSupervisedTuning(job: TrainingJobRow): boolean {
  const method = String(job.method || "sft").toLowerCase();
  return method === "sft" && isGeminiOrGemma(job.baseModelId);
}

function tunedModelFrom(info: Record<string, unknown>): { model?: string; endpoint?: string } {
  const tuned = asRecord(info.tunedModel || info.tuned_model);
  const model = String(tuned.model || "").trim() || undefined;
  const endpoint = String(tuned.endpoint || "").trim() || undefined;
  return { model, endpoint };
}

function ftAlias(jobId: string, tuned: { model?: string; endpoint?: string }): string {
  const raw = tuned.model || tuned.endpoint || "";
  const last = raw.split("/").pop()?.replace(/@.*$/, "") || "";
  if (last && last.length <= 140) return `ft:${last}`.slice(0, 150);
  return `ft:${jobId.replace(/-/g, "").slice(0, 20)}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function vertexFetch(
  url: string,
  token: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = asRecord(JSON.parse(text));
  } catch {
    json = { raw: text.slice(0, 800) };
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function uploadJsonlToGcs(
  token: string,
  object: string,
  jsonl: string
): Promise<string> {
  const bucket = tuningBucket();
  if (!bucket) {
    throw new Error(
      "Vertex supervised tuning needs a gs:// JSONL dataset. Set VERTEX_TUNING_BUCKET or OPENDOOR_FILES_BUCKET, or pass storageUri as gs://..."
    );
  }
  const url =
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
    `?uploadType=media&name=${encodeURIComponent(object)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/jsonl",
    },
    body: jsonl,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`GCS upload for Vertex tuning failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
  }
  return `gs://${bucket}/${object}`;
}

async function resolveTrainingDatasetUri(
  token: string,
  job: TrainingJobRow,
  dataset: DatasetRow | null
): Promise<string> {
  const uri = dataset?.storageUri || "";
  if (uri.startsWith("gs://")) return uri;
  const rows = dataset ? inlineRows(dataset) : [];
  if (!rows.length) {
    throw new Error(
      "Vertex supervised tuning requires a gs:// JSONL dataset or inline rows. Upload a dataset or set storageUri."
    );
  }
  const jsonl = rows.map(toGeminiSftLine).join("\n");
  const object = `training/${job.organizationId}/${job.id}/${dataset?.slug || "dataset"}.jsonl`;
  return uploadJsonlToGcs(token, object, jsonl);
}

async function markSubmitted(
  jobId: string,
  providerJobId: string,
  kind: "tuningJobs" | "customJobs",
  message: string
) {
  const db = getDb();
  await db
    .update(trainingJobs)
    .set({
      providerJobId: providerJobId.slice(0, 255),
      providerSlug: "vertex",
      progressPercent: 15,
      statusMessage: message,
      result: { vertexApi: kind, name: providerJobId },
      updatedAt: new Date(),
    })
    .where(eq(trainingJobs.id, jobId));
}

async function registerTunedModel(
  job: TrainingJobRow,
  info: Record<string, unknown>,
  tuned: { model?: string; endpoint?: string }
) {
  const db = getDb();
  const outputModelId = ftAlias(job.id, tuned);
  await db.insert(fineTunedModels).values({
    organizationId: job.organizationId,
    trainingJobId: job.id,
    modelId: outputModelId,
    displayName: job.name,
    baseModelId: job.baseModelId,
    providerSlug: "vertex",
    status: "active",
    billAsBase: true,
    adapterUri: tuned.model || tuned.endpoint || null,
    metadata: { vertex: info, tunedModel: tuned },
  });
  await db
    .update(trainingJobs)
    .set({
      status: "succeeded",
      progressPercent: 100,
      outputModelId,
      finishedAt: new Date(),
      result: info,
      statusMessage: "Vertex supervised tuning completed",
      updatedAt: new Date(),
    })
    .where(eq(trainingJobs.id, job.id));
}

async function pollVertexJob(
  token: string,
  resourceName: string,
  location: string,
  job: TrainingJobRow,
  kind: "tuningJobs" | "customJobs"
): Promise<void> {
  const db = getDb();
  const url = `${aiPlatformHost(location)}/v1/${resourceName}`;

  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await sleep(POLL_MS);
    const st = await vertexFetch(url, token);
    if (!st.ok) continue;
    const state = jobState(st.json);
    await db
      .update(trainingJobs)
      .set({
        progressPercent: Math.min(95, 15 + i),
        statusMessage: `Vertex ${kind}: ${state || "running"}`,
        result: { vertexApi: kind, name: resourceName, last: st.json },
        updatedAt: new Date(),
      })
      .where(eq(trainingJobs.id, job.id));

    if (isSuccessState(state)) {
      const tuned = tunedModelFrom(st.json);
      if (tuned.model || tuned.endpoint) {
        await registerTunedModel(job, st.json, tuned);
        return;
      }
      // CustomJob (or a tuning job with no model resource) — record Vertex status only.
      await db
        .update(trainingJobs)
        .set({
          status: "succeeded",
          progressPercent: 100,
          finishedAt: new Date(),
          result: st.json,
          statusMessage:
            kind === "customJobs"
              ? "Vertex CustomJob succeeded; no tuned model resource returned (not minting ft:)."
              : "Vertex job succeeded but TuningJob.tunedModel was empty (not minting ft:).",
          updatedAt: new Date(),
        })
        .where(eq(trainingJobs.id, job.id));
      return;
    }

    if (isFailedState(state)) {
      const err = asRecord(st.json.error);
      throw new Error(
        `Vertex ${kind} ${state}: ${String(err.message || JSON.stringify(st.json).slice(0, 400))}`
      );
    }

    if (state && !isRunningState(state)) {
      throw new Error(`Vertex ${kind} unexpected state ${state}: ${JSON.stringify(st.json).slice(0, 400)}`);
    }
  }

  await db
    .update(trainingJobs)
    .set({
      status: "running",
      statusMessage: `Vertex ${kind} still running — refresh later`,
      updatedAt: new Date(),
    })
    .where(eq(trainingJobs.id, job.id));
}

async function createTuningJob(
  token: string,
  project: string,
  location: string,
  job: TrainingJobRow,
  datasetUri: string
): Promise<string> {
  const hp = asRecord(job.hyperparameters);
  const hyperParameters: Record<string, unknown> = {};
  if (hp.epochs != null) hyperParameters.epochCount = String(hp.epochs);
  if (hp.epochCount != null) hyperParameters.epochCount = String(hp.epochCount);
  if (hp.learning_rate_multiplier != null || hp.learningRateMultiplier != null) {
    hyperParameters.learningRateMultiplier = Number(
      hp.learning_rate_multiplier ?? hp.learningRateMultiplier
    );
  }
  const adapter = adapterSize(hp);
  if (adapter) hyperParameters.adapterSize = adapter;

  const supervisedTuningSpec: Record<string, unknown> = {
    trainingDatasetUri: datasetUri,
  };
  if (Object.keys(hyperParameters).length) {
    supervisedTuningSpec.hyperParameters = hyperParameters;
  }

  const body = {
    baseModel: vertexBaseModel(job.baseModelId),
    tunedModelDisplayName: job.name.slice(0, 128),
    supervisedTuningSpec,
  };

  const url = `${aiPlatformHost(location)}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/tuningJobs`;
  const created = await vertexFetch(url, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!created.ok) {
    throw new Error(
      `Vertex tuningJobs.create failed (${created.status}): ${created.text.slice(0, 800)}`
    );
  }
  const name = String(created.json.name || "");
  if (!name) {
    throw new Error(
      `Vertex tuningJobs.create returned no resource name: ${created.text.slice(0, 400)}`
    );
  }
  return name;
}

async function createCustomJob(
  token: string,
  project: string,
  location: string,
  job: TrainingJobRow,
  datasetUri: string | null
): Promise<string> {
  const image = customTrainingImage();
  if (!image) {
    throw new Error(
      "Vertex Supervised Tuning (tuningJobs) fits Gemini/Gemma SFT with a gs:// JSONL dataset. " +
        "This job is not that path. Set VERTEX_CUSTOM_TRAINING_IMAGE (or GCP_TRAINER_ENDPOINT as a container image) for a CustomJob. " +
        "Not minting a simulated ft: model."
    );
  }

  const machineSpec: Record<string, unknown> = {
    machineType: env("VERTEX_CUSTOM_MACHINE_TYPE") || "n1-standard-4",
  };
  const accel = env("VERTEX_CUSTOM_ACCELERATOR_TYPE");
  if (accel) {
    machineSpec.acceleratorType = accel;
    machineSpec.acceleratorCount = Number(env("VERTEX_CUSTOM_ACCELERATOR_COUNT") || "1");
  }

  const body = {
    displayName: `opendoor-${job.id}`.slice(0, 128),
    jobSpec: {
      workerPoolSpecs: [
        {
          machineSpec,
          replicaCount: 1,
          containerSpec: {
            imageUri: image,
            args: [
              `--job-id=${job.id}`,
              `--base-model=${job.baseModelId}`,
              `--method=${job.method}`,
              `--dataset-uri=${datasetUri || ""}`,
            ],
            env: [
              { name: "OPENDOOR_JOB_ID", value: job.id },
              { name: "OPENDOOR_BASE_MODEL", value: job.baseModelId },
              { name: "OPENDOOR_METHOD", value: job.method },
              { name: "OPENDOOR_DATASET_URI", value: datasetUri || "" },
            ],
          },
        },
      ],
    },
  };

  const url = `${aiPlatformHost(location)}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/customJobs`;
  const created = await vertexFetch(url, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!created.ok) {
    throw new Error(
      `Vertex customJobs.create failed (${created.status}): ${created.text.slice(0, 800)}`
    );
  }
  const name = String(created.json.name || "");
  if (!name) {
    throw new Error(
      `Vertex customJobs.create returned no resource name: ${created.text.slice(0, 400)}`
    );
  }
  return name;
}

/**
 * Create and poll a Vertex tuning or custom job. Caller must have already
 * confirmed GCP project + ADC via `canStartVertexTrainingJob`.
 */
export async function startVertexTrainingJob(
  job: TrainingJobRow,
  dataset: DatasetRow | null
): Promise<void> {
  const project = vertexTrainingProjectId();
  const token = await getGcpAccessToken();
  if (!project || !token) {
    throw new Error(
      "Vertex trainer needs GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials."
    );
  }

  const location = vertexTuningLocation();
  let datasetUri: string | null = null;
  if (dataset) {
    const raw = dataset.storageUri || "";
    if (raw.startsWith("gs://")) datasetUri = raw;
    else if (inlineRows(dataset).length) {
      datasetUri = await resolveTrainingDatasetUri(token, job, dataset);
    }
  }

  if (usesSupervisedTuning(job)) {
    if (!datasetUri) {
      throw new Error(
        "Vertex supervised tuning (Gemini/Gemma SFT) requires a gs:// JSONL dataset or inline rows to upload."
      );
    }
    try {
      const name = await createTuningJob(token, project, location, job, datasetUri);
      await markSubmitted(job.id, name, "tuningJobs", "Vertex tuningJobs submitted");
      await pollVertexJob(token, name, location, job, "tuningJobs");
      return;
    } catch (err) {
      if (!customTrainingImage()) throw err;
      // Gemma / unsupported baseModel: record a real CustomJob instead of inventing ft:.
    }
  }

  const name = await createCustomJob(token, project, location, job, datasetUri);
  await markSubmitted(job.id, name, "customJobs", "Vertex customJobs submitted");
  await pollVertexJob(token, name, location, job, "customJobs");
}
