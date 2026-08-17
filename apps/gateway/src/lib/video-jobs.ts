import { randomBytes } from "crypto";
import { createStoredFile, getStoredFileBytes } from "./file-store.js";
import { filesUseGcs, gcsFilesPrefix, gcsGetObject, gcsPutObject } from "./gcs-objects.js";
import {
  pollVeoOperation,
  startVeoGeneration,
  type VeoStartResult,
} from "./vertex-media.js";

export type VideoJobStatus = "queued" | "processing" | "completed" | "failed";

export type VideoJob = {
  id: string;
  object: "video.generation";
  created: number;
  model: string;
  location: string;
  organizationId: string;
  status: VideoJobStatus;
  operationName?: string;
  fileId?: string;
  mimeType?: string;
  error?: string;
};

const jobs = new Map<string, VideoJob>();

function jobObject(organizationId: string, id: string): string {
  return `${gcsFilesPrefix()}/video-jobs/${organizationId}/${id}.json`;
}

async function persist(job: VideoJob): Promise<void> {
  jobs.set(job.id, job);
  if (!filesUseGcs()) return;
  try {
    await gcsPutObject(
      jobObject(job.organizationId, job.id),
      Buffer.from(JSON.stringify(job)),
      "application/json"
    );
  } catch {
    /* in-memory job still serves this instance */
  }
}

async function load(organizationId: string, id: string): Promise<VideoJob | null> {
  const mem = jobs.get(id);
  if (mem && mem.organizationId === organizationId) return mem;
  if (!filesUseGcs()) return null;
  const buf = await gcsGetObject(jobObject(organizationId, id));
  if (!buf) return null;
  try {
    const row = JSON.parse(buf.toString("utf8")) as VideoJob;
    if (!row || row.organizationId !== organizationId) return null;
    jobs.set(row.id, row);
    return row;
  } catch {
    return null;
  }
}

export async function createVideoJob(opts: {
  organizationId: string;
  prompt: string;
  model?: string;
  n?: number;
  duration?: number;
  size?: string;
  aspect_ratio?: string;
  image?: unknown;
}): Promise<VideoJob> {
  const started: VeoStartResult = await startVeoGeneration({
    model: opts.model,
    prompt: opts.prompt,
    n: opts.n,
    duration: opts.duration,
    size: opts.size,
    aspect_ratio: opts.aspect_ratio,
    image: opts.image,
  });
  const job: VideoJob = {
    id: `vid_${randomBytes(12).toString("hex")}`,
    object: "video.generation",
    created: Math.floor(Date.now() / 1000),
    model: started.model,
    location: started.location,
    organizationId: opts.organizationId,
    status: "processing",
    operationName: started.operationName,
    mimeType: "video/mp4",
  };
  await persist(job);
  return job;
}

export async function getVideoJob(organizationId: string, id: string): Promise<VideoJob | null> {
  const job = await load(organizationId, id);
  if (!job) return null;
  if (job.status === "processing" && job.operationName) {
    return refreshVideoJob(job);
  }
  return job;
}

async function refreshVideoJob(job: VideoJob): Promise<VideoJob> {
  if (!job.operationName) return job;
  const poll = await pollVeoOperation({
    model: job.model,
    location: job.location,
    operationName: job.operationName,
  });
  if (!poll.done) return job;
  if (poll.error || !poll.videos.length) {
    job.status = "failed";
    job.error = poll.error || "Veo finished without video bytes. No video was invented.";
    await persist(job);
    return job;
  }
  const first = poll.videos[0];
  if (first.b64) {
    try {
      const buf = Buffer.from(first.b64, "base64");
      const row = await createStoredFile({
        organizationId: job.organizationId,
        filename: `${job.id}.mp4`,
        purpose: "video-generation",
        buf,
      });
      job.fileId = row.id;
      job.mimeType = first.mimeType || "video/mp4";
      job.status = "completed";
      await persist(job);
      return job;
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Could not store video bytes. No video was invented.";
      await persist(job);
      return job;
    }
  }
  job.status = "failed";
  job.error =
    first.gcsUri
      ? `Veo wrote ${first.gcsUri} but this gateway only returns inline bytes or files it stored. No video was invented.`
      : "Veo finished without video bytes. No video was invented.";
  await persist(job);
  return job;
}

export function toVideoApi(job: VideoJob, opts?: { includeContentPath?: boolean }) {
  const content =
    job.status === "completed" && job.fileId
      ? `/v1/videos/generations/${job.id}/content`
      : undefined;
  return {
    id: job.id,
    object: job.object,
    created: job.created,
    model: job.model,
    status: job.status,
    url: opts?.includeContentPath === false ? undefined : content,
    mime_type: job.mimeType,
    error: job.error,
  };
}

export async function getVideoJobBytes(
  organizationId: string,
  id: string
): Promise<{ job: VideoJob; buf: Buffer; mimeType: string } | null> {
  const job = await getVideoJob(organizationId, id);
  if (!job || job.status !== "completed" || !job.fileId) return null;
  const stored = await getStoredFileBytes(organizationId, job.fileId);
  if (!stored) return null;
  return { job, buf: stored.buf, mimeType: job.mimeType || "video/mp4" };
}
