import { Hono } from "hono";
import {
  generatePrivateVideo,
  isPrivateImageDown,
  isPrivateVideoUnavailable,
  parseStudioMode,
  wantsPrivateGpuBackend,
} from "@opendoor/shared";
import { collectPrivateImageUrls } from "../lib/private-gpu.js";
import { logGatewayRequest } from "../lib/request-log.js";
import { createVideoJob, getVideoJob, getVideoJobBytes, toVideoApi } from "../lib/video-jobs.js";
import {
  VertexMediaConfigError,
  VertexMediaUpstreamError,
  listedVideoModels,
  vertexMediaConfigured,
} from "../lib/vertex-media.js";

const videosRouter = new Hono();

function mediaError(err: unknown): { status: 400 | 404 | 502 | 503; body: Record<string, unknown> } {
  if (err instanceof VertexMediaConfigError) {
    return { status: 503, body: { error: err.message } };
  }
  if (err instanceof VertexMediaUpstreamError) {
    const status = (err.status === 404 ? 404 : err.status === 400 ? 400 : 502) as 400 | 404 | 502;
    return { status, body: { error: err.message } };
  }
  const msg = err instanceof Error ? err.message : "Video generation failed";
  return { status: 502, body: { error: msg } };
}

videosRouter.get("/models", (c) => {
  if (!vertexMediaConfigured()) {
    return c.json({ object: "list", data: [] });
  }
  return c.json({
    object: "list",
    data: listedVideoModels().map((m) => ({
      id: m.id,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "google",
      provider: "vertex",
      display_name: m.display_name,
      architecture: {
        modality: "video",
        input_modalities: ["text", "image"],
        output_modalities: ["video"],
      },
    })),
  });
});

async function readVideoBody(c: {
  req: { header: (name: string) => string | undefined; json: () => Promise<any>; formData: () => Promise<FormData> };
}) {
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("video") || form.get("image") || form.get("file");
    let video: unknown;
    if (file && typeof file === "object" && typeof (file as File).arrayBuffer === "function") {
      video = {
        bytes: new Uint8Array(await (file as File).arrayBuffer()),
        mime: (file as File).type || "video/mp4",
        filename: (file as File).name || "input.mp4",
      };
    } else if (typeof file === "string") {
      video = file;
    }
    return {
      prompt: String(form.get("prompt") || ""),
      model: String(form.get("model") || ""),
      mode: parseStudioMode(form.get("mode")),
      video,
      image: form.get("image"),
      size: form.get("size") ? String(form.get("size")) : undefined,
      strength: form.get("strength") != null ? Number(form.get("strength")) : undefined,
      duration: form.get("duration") != null ? Number(form.get("duration")) : undefined,
      aspect_ratio: form.get("aspect_ratio") ? String(form.get("aspect_ratio")) : undefined,
      n: form.get("n") != null ? Number(form.get("n")) : undefined,
    };
  }
  const body = await c.req.json().catch(() => ({}));
  return {
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    model: typeof body.model === "string" ? body.model : "",
    mode: parseStudioMode(body.mode),
    video: body.video,
    image: body.image,
    size: typeof body.size === "string" ? body.size : undefined,
    strength: typeof body.strength === "number" ? body.strength : undefined,
    duration: typeof body.duration === "number" ? body.duration : undefined,
    aspect_ratio:
      typeof body.aspect_ratio === "string"
        ? body.aspect_ratio
        : typeof body.aspectRatio === "string"
          ? body.aspectRatio
          : undefined,
    n: typeof body.n === "number" ? body.n : undefined,
  };
}

videosRouter.post("/generations", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const body = await readVideoBody(c);
  const model = body.model;
  const privateVideo = body.mode === "v2v" || wantsPrivateGpuBackend(model, c.req.header("x-opendoor-backend") || "");

  if (privateVideo) {
    if (body.mode && body.mode !== "v2v") {
      return c.json({ error: "Use POST /v1/images/generations for txt2img and img2img" }, 400);
    }
    if (!body.mode) {
      return c.json({ error: "mode is required", message: 'Set mode to "v2v" for private video-to-video.' }, 400);
    }
    const started = Date.now();
    try {
      const extraUrls = await collectPrivateImageUrls(organization.id, model || "premium:private");
      const { video, endpoint, probe } = await generatePrivateVideo({
        prompt: body.prompt || "keep motion, refine the look",
        video: body.video || body.image,
        size: body.size,
        strength: body.strength,
        extraUrls,
      });
      await logGatewayRequest({
        apiKeyId: apiKey.id,
        organizationId: organization.id,
        providerSlug: "custom",
        modelId: model || `private:${endpoint.kind}`,
        requestType: "image",
        promptTokens: 0,
        latencyMs: Date.now() - started,
        costUsd: 0,
        metadata: { kind: "video", mode: "v2v", status: "completed" },
      });
      return c.json({
        created: Math.floor(Date.now() / 1000),
        status: "completed",
        mode: "v2v",
        endpoint,
        probe: {
          loadNode: probe.loadNode,
          combineNode: probe.combineNode,
          animateDiffNode: probe.animateDiffNode,
        },
        data: [{ b64_json: video.b64, mime: video.mime }],
      });
    } catch (err) {
      if (isPrivateVideoUnavailable(err) || isPrivateImageDown(err)) {
        return c.json({ error: "Studio GPU offline" }, 503);
      }
      const message = err instanceof Error ? err.message : "Video generation failed";
      return c.json({ error: message }, /required/i.test(message) ? 400 : 502);
    }
  }

  if (!vertexMediaConfigured()) {
    return c.json(
      {
        error: "Video generation is not configured",
        message:
          "Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials for Vertex Veo. This endpoint does not invent videos.",
      },
      503
    );
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return c.json({ error: "prompt is required" }, 400);

  const started = Date.now();
  try {
    const job = await createVideoJob({
      organizationId: organization.id,
      prompt,
      model: typeof body.model === "string" ? body.model : undefined,
      n: typeof body.n === "number" ? body.n : undefined,
      duration: typeof body.duration === "number" ? body.duration : undefined,
      size: typeof body.size === "string" ? body.size : undefined,
      aspect_ratio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : undefined,
      image: body.image,
    });
    await logGatewayRequest({
      apiKeyId: apiKey.id,
      organizationId: organization.id,
      providerSlug: "vertex",
      modelId: job.model,
      requestType: "image",
      promptTokens: 0,
      latencyMs: Date.now() - started,
      costUsd: 0,
      metadata: { kind: "video", status: job.status },
    });
    return c.json(toVideoApi(job), 200);
  } catch (err) {
    const mapped = mediaError(err);
    return c.json(mapped.body, mapped.status);
  }
});

videosRouter.get("/generations/:id/content", async (c) => {
  const organization = c.get("organization");
  const id = c.req.param("id");
  try {
    const row = await getVideoJobBytes(organization.id, id);
    if (!row) {
      const job = await getVideoJob(organization.id, id);
      if (!job) return c.json({ error: "Video generation not found" }, 404);
      if (job.status === "failed") return c.json({ error: job.error || "Video generation failed" }, 502);
      return c.json({ error: "Video is not ready", status: job.status }, 409);
    }
    return c.body(new Uint8Array(row.buf), 200, {
      "Content-Type": row.mimeType,
      "Content-Disposition": `inline; filename="${row.job.id}.mp4"`,
    });
  } catch (err) {
    const mapped = mediaError(err);
    return c.json(mapped.body, mapped.status);
  }
});

videosRouter.get("/generations/:id", async (c) => {
  const organization = c.get("organization");
  try {
    const job = await getVideoJob(organization.id, c.req.param("id"));
    if (!job) return c.json({ error: "Video generation not found" }, 404);
    return c.json(toVideoApi(job));
  } catch (err) {
    const mapped = mediaError(err);
    return c.json(mapped.body, mapped.status);
  }
});

export default videosRouter;
