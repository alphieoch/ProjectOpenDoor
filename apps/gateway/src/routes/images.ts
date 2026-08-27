import { Hono } from "hono";
import OpenAI from "openai";
import {
  PREMIUM_IMAGE_MODELS,
  PRIVATE_GPU_OFFLINE,
  configuredPrivateImageUrl,
  decodeMediaString,
  discoverPrivateImageEndpoint,
  generatePrivateImage,
  isPrivateImageDown,
  parseStudioMode,
  privateImageOfflineHint,
  resolvedPrivateImageUrl,
  wantsPrivateGpuBackend,
} from "@opendoor/shared";
import { loadOrgProviderKeys, touchOrgProviderKeyUsed } from "../lib/byok.js";
import { collectPrivateImageUrls } from "../lib/private-gpu.js";
import { logGatewayRequest } from "../lib/request-log.js";
import {
  VertexMediaConfigError,
  VertexMediaUpstreamError,
  defaultImageModel,
  generateVertexImage,
  isOpenAiImageModel,
  isVertexImageRequest,
  listedImageModels,
  vertexMediaConfigured,
} from "../lib/vertex-media.js";

const imagesRouter = new Hono();

function openaiClient(apiKey: string) {
  return new OpenAI({ apiKey });
}

function backendHeader(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header("x-opendoor-backend") || "";
}

async function readImageBody(c: { req: { header: (name: string) => string | undefined; json: () => Promise<any>; formData: () => Promise<FormData> } }) {
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("image") || form.get("file");
    let image: unknown;
    if (file && typeof file === "object" && typeof (file as File).arrayBuffer === "function") {
      const buf = new Uint8Array(await (file as File).arrayBuffer());
      image = { bytes: buf, mime: (file as File).type || "image/png", filename: (file as File).name || "input.png" };
    } else if (typeof file === "string") {
      image = decodeMediaString(file, "input.png");
    }
    return {
      prompt: String(form.get("prompt") || ""),
      model: String(form.get("model") || ""),
      size: form.get("size") ? String(form.get("size")) : undefined,
      n: Number(form.get("n") || 1),
      response_format: String(form.get("response_format") || "b64_json"),
      mode: parseStudioMode(form.get("mode")),
      image,
      strength: form.get("strength") != null ? Number(form.get("strength")) : undefined,
      seed: form.get("seed") != null ? Number(form.get("seed")) : undefined,
      steps: form.get("steps") != null ? Number(form.get("steps")) : undefined,
      negative_prompt: String(form.get("negative_prompt") || form.get("negativePrompt") || ""),
      quality: form.get("quality") ? String(form.get("quality")) : undefined,
      aspect_ratio: form.get("aspect_ratio") || form.get("aspectRatio") ? String(form.get("aspect_ratio") || form.get("aspectRatio")) : undefined,
      image_size: form.get("image_size") || form.get("imageSize") ? String(form.get("image_size") || form.get("imageSize")) : undefined,
      mask: form.get("mask") || undefined,
    };
  }
  const body = await c.req.json();
  return {
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    model: typeof body.model === "string" ? body.model : "",
    size: typeof body.size === "string" ? body.size : undefined,
    n: Number(body.n) || 1,
    response_format: body.response_format || "b64_json",
    mode: parseStudioMode(body.mode),
    image: body.image,
    strength: typeof body.strength === "number" ? body.strength : undefined,
    seed: typeof body.seed === "number" ? body.seed : undefined,
    steps: typeof body.steps === "number" ? body.steps : undefined,
    negative_prompt:
      typeof body.negative_prompt === "string"
        ? body.negative_prompt
        : typeof body.negativePrompt === "string"
          ? body.negativePrompt
          : "",
    quality: body.quality,
    aspect_ratio: body.aspect_ratio || body.aspectRatio,
    image_size: body.image_size || body.imageSize,
    mask: body.mask,
  };
}

async function azureImageGenerate(opts: {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  response_format?: string;
}) {
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT?.replace(/\/$/, "");
  const key = process.env.AZURE_AI_FOUNDRY_KEY;
  if (!endpoint || !key) return null;
  const model = opts.model || "dall-e-3";
  const url = `${endpoint}/openai/deployments/${model}/images/generations?api-version=2024-02-01`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": key },
    body: JSON.stringify({
      prompt: opts.prompt,
      n: opts.n ?? 1,
      size: opts.size || "1024x1024",
      quality: opts.quality,
      response_format: opts.response_format || "url",
    }),
  });
  if (!res.ok) {
    throw new Error(`Azure image generation failed: ${(await res.text()).slice(0, 800)}`);
  }
  return res.json();
}

function toOpenAiData(
  images: Array<{ b64_json: string; mimeType?: string; revised_prompt?: string }>,
  responseFormat: string
) {
  return images.map((img) => {
    if (responseFormat === "url") {
      const mime = img.mimeType || "image/png";
      return { url: `data:${mime};base64,${img.b64_json}`, revised_prompt: img.revised_prompt };
    }
    return { b64_json: img.b64_json, revised_prompt: img.revised_prompt };
  });
}

function privateModelRows() {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: "premium:private",
      object: "model",
      created: now,
      owned_by: "private",
      provider: "private",
      display_name: "Private GPU",
      architecture: {
        modality: "image",
        input_modalities: ["text"],
        output_modalities: ["image"],
      },
    },
    ...PREMIUM_IMAGE_MODELS.filter((m) => m.status === "live").map((m) => ({
      id: m.id,
      object: "model",
      created: now,
      owned_by: "private",
      provider: "private",
      display_name: m.displayName,
      architecture: {
        modality: "image",
        input_modalities: ["text"],
        output_modalities: ["image"],
      },
    })),
  ];
}

imagesRouter.get("/models", async (c) => {
  const organization = c.get("organization");
  const extraUrls = await collectPrivateImageUrls(organization.id, "premium:private");
  const discovered = await discoverPrivateImageEndpoint(extraUrls);
  const showPrivate =
    Boolean(configuredPrivateImageUrl()) || extraUrls.length > 0 || Boolean(discovered);

  const data = [
    ...(showPrivate ? privateModelRows() : []),
    ...(vertexMediaConfigured()
      ? listedImageModels().map((m) => ({
          id: m.id,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "google",
          provider: "vertex",
          display_name: m.display_name,
          architecture: {
            modality: "image",
            input_modalities: ["text", "image"],
            output_modalities: ["image"],
          },
        }))
      : []),
  ];

  return c.json({ object: "list", data });
});

imagesRouter.post("/generations", async (c) => {
  const apiKey = c.get("apiKey");
  const organization = c.get("organization");
  const body = await readImageBody(c);
  if (body.mode === "v2v") {
    return c.json({ error: "Use POST /v1/videos/generations with mode v2v" }, 400);
  }
  if (body.image && !body.mode) {
    return c.json({ error: "mode is required when image is provided", message: 'Set mode to "img2img".' }, 400);
  }
  const prompt = body.prompt;
  if (!prompt && body.mode !== "img2img") return c.json({ error: "prompt is required" }, 400);
  if (body.mode === "img2img" && !body.image) {
    return c.json({ error: "image is required for img2img" }, 400);
  }

  const vertexOn = vertexMediaConfigured();
  const model =
    (body.model && body.model.trim()) ||
    (vertexOn ? defaultImageModel() : "premium:private");
  const started = Date.now();
  const byok = await loadOrgProviderKeys(organization.id);
  const openaiByok = byok.get("openai");
  const openaiKey = openaiByok?.plaintext || process.env.OPENAI_API_KEY;
  const responseFormat = body.response_format || "b64_json";
  const size = body.size;
  const n = Math.min(Math.max(Number(body.n) || 1, 1), 4);
  const extraUrls = await collectPrivateImageUrls(organization.id, model);
  const discovered = await discoverPrivateImageEndpoint(extraUrls);
  const forcePrivate =
    wantsPrivateGpuBackend(model, backendHeader(c)) || model.startsWith("custom:");
  const preferPrivate =
    forcePrivate ||
    Boolean(configuredPrivateImageUrl()) ||
    extraUrls.length > 0 ||
    Boolean(discovered);

  const logPrivate = async (resolvedModel: string) => {
    await logGatewayRequest({
      apiKeyId: apiKey.id,
      organizationId: organization.id,
      providerSlug: "custom",
      modelId: resolvedModel,
      requestType: "image",
      promptTokens: 0,
      latencyMs: Date.now() - started,
      costUsd: 0,
    });
  };

  const generateOnPrivateGpu = async () => {
    const images: Array<{ b64_json: string; mimeType?: string }> = [];
    let resolved = model;
    for (let i = 0; i < n; i++) {
      const { image, endpoint } = await generatePrivateImage({
        prompt: prompt || "keep the subject, refine details",
        size,
        extraUrls,
        mode: body.mode === "img2img" ? "img2img" : "txt2img",
        image: body.image,
        strength: body.strength,
        seed: body.seed,
        steps: body.steps,
        negativePrompt: body.negative_prompt,
      });
      images.push({ b64_json: image.b64, mimeType: image.mime });
      resolved = model === "premium:private" ? `private:${endpoint.kind}` : model;
    }
    await logPrivate(resolved);
    return c.json({
      created: Math.floor(Date.now() / 1000),
      data: toOpenAiData(images, responseFormat),
    });
  };

  const generateOpenAiOrAzure = async () => {
    let data: any;
    let providerSlug = "openai";
    if (openaiKey) {
      if (openaiByok) touchOrgProviderKeyUsed(openaiByok.id);
      const client = openaiClient(openaiKey);
      data = await client.images.generate({
        model: isOpenAiImageModel(model) ? model : "dall-e-3",
        prompt,
        n,
        size: size || "1024x1024",
        quality: body.quality,
        response_format: body.response_format || "url",
      } as any);
    } else {
      const azure = await azureImageGenerate({
        model: isOpenAiImageModel(model) ? model : "dall-e-3",
        prompt,
        n,
        size,
        quality: body.quality,
        response_format: body.response_format,
      });
      if (!azure) return null;
      data = azure;
      providerSlug = "azure-foundry";
    }

    await logGatewayRequest({
      apiKeyId: apiKey.id,
      organizationId: organization.id,
      providerSlug,
      modelId: model,
      requestType: "image",
      promptTokens: 0,
      latencyMs: Date.now() - started,
      costUsd: 0,
    });

    return c.json({
      created: Math.floor(Date.now() / 1000),
      data: data.data || data,
    });
  };

  const generateVertex = async () => {
    if (!vertexOn) return null;
    const generated = await generateVertexImage({
      model: isVertexImageRequest(model)
        ? model
        : isOpenAiImageModel(model) ||
            model.startsWith("opendoor-") ||
            model.startsWith("premium:") ||
            model.startsWith("custom:")
          ? defaultImageModel()
          : model || defaultImageModel(),
      prompt,
      n,
      size: body.size,
      aspect_ratio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : undefined,
      image_size:
        body.image_size === "1K" || body.image_size === "2K" || body.image_size === "4K"
          ? body.image_size
          : undefined,
      quality: typeof body.quality === "string" ? body.quality : undefined,
      image: body.image,
      mask: body.mask,
    });
    await logGatewayRequest({
      apiKeyId: apiKey.id,
      organizationId: organization.id,
      providerSlug: "vertex",
      modelId: generated.model,
      requestType: "image",
      promptTokens: 0,
      latencyMs: Date.now() - started,
      costUsd: 0,
    });
    return c.json({
      created: Math.floor(Date.now() / 1000),
      data: toOpenAiData(generated.images, responseFormat),
    });
  };

  try {
    if (isVertexImageRequest(model)) {
      if (!vertexOn) {
        return c.json(
          { error: "Google image generation is not configured. Set Vertex credentials for Nano Banana." },
          503
        );
      }
      try {
        const vertex = await generateVertex();
        if (vertex) return vertex;
      } catch (err) {
        if (err instanceof VertexMediaConfigError) {
          return c.json({ error: err.message }, 503);
        }
        if (err instanceof VertexMediaUpstreamError) {
          const status = err.status === 404 ? 404 : err.status === 400 ? 400 : 502;
          return c.json({ error: err.message }, status);
        }
        throw err;
      }
    }

    if (preferPrivate) {
      try {
        return await generateOnPrivateGpu();
      } catch (err) {
        if (isPrivateImageDown(err)) {
          if (!forcePrivate || err.allowFallback) {
            if (!(body.mode === "img2img" && body.image)) {
              const fallback = await generateOpenAiOrAzure();
              if (fallback) return fallback;
            }
            try {
              const vertex = await generateVertex();
              if (vertex) return vertex;
            } catch {
              /* fall through to offline */
            }
          }
          return c.json(
            {
              error: PRIVATE_GPU_OFFLINE,
              message: privateImageOfflineHint(resolvedPrivateImageUrl()),
            },
            503
          );
        }
        const message = err instanceof Error ? err.message : "Image generation failed";
        return c.json({ error: message }, /required/i.test(message) ? 400 : 502);
      }
    }

    if (!(body.mode === "img2img" && body.image)) {
      const cloud = await generateOpenAiOrAzure();
      if (cloud) return cloud;
    }

    if (vertexOn && !model.startsWith("premium:")) {
      try {
        const vertex = await generateVertex();
        if (vertex) return vertex;
      } catch (err) {
        const vertexOnly =
          /^imagen/i.test(model) ||
          /^imagegeneration@/i.test(model) ||
          /gemini-.*-image/i.test(model);
        if (vertexOnly || err instanceof VertexMediaConfigError) {
          if (err instanceof VertexMediaConfigError) {
            return c.json({ error: err.message }, 503);
          }
          if (err instanceof VertexMediaUpstreamError) {
            const status = err.status === 404 ? 404 : err.status === 400 ? 400 : 502;
            return c.json({ error: err.message }, status);
          }
          throw err;
        }
      }
    }

    return c.json(
      {
        error: PRIVATE_GPU_OFFLINE,
        message: PRIVATE_GPU_OFFLINE,
      },
      503
    );
  } catch (err: any) {
    if (err instanceof VertexMediaConfigError) {
      return c.json({ error: err.message }, 503);
    }
    if (err instanceof VertexMediaUpstreamError) {
      const status = err.status === 404 ? 404 : err.status === 400 ? 400 : 502;
      return c.json({ error: err.message }, status);
    }
    const msg = err?.message || "Image generation failed";
    const status = msg.includes("not configured") ? 503 : 502;
    return c.json({ error: msg }, status);
  }
});

export default imagesRouter;
