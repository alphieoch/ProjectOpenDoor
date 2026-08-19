import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  STUDIO_IMAGE_MAX_BYTES,
  STYLE_PRESETS,
  isGoogleStudioImageModel,
  readStudioRequest,
  resolveStudioApiModel,
  studioCloudImageUrl,
  studioErrorMessage,
  studioGatewayHeaders,
  studioGatewaySecret,
  studioGatewayUrl,
} from "@/lib/studio";
import { forbidProtectedChild } from "@/lib/parent-protection";

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const blocked = await forbidProtectedChild(session);
  if (blocked) return blocked;
  const orgId = session.orgId as string;
  const parsed = await readStudioRequest(req);
  const mode =
    parsed.mode === "img2img" || parsed.mode === "txt2img"
      ? parsed.mode
      : parsed.image
        ? "img2img"
        : "txt2img";

  if (parsed.mode === "v2v") {
    return NextResponse.json(
      { error: "Use POST /api/studio/video for video to video", mode: "v2v" },
      { status: 400 }
    );
  }

  let prompt = parsed.prompt;
  if (mode === "txt2img" && !prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (mode === "img2img" && !parsed.image) {
    return NextResponse.json({ error: "image is required for img2img" }, { status: 400 });
  }
  if (mode === "img2img" && !prompt) {
    prompt = "keep the subject, refine details";
  }

  if (parsed.image && parsed.image.bytes.length > STUDIO_IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: "image exceeds 20MB limit" }, { status: 400 });
  }

  const preset = STYLE_PRESETS.find((p) => p.id === parsed.stylePreset);
  if (preset?.promptSuffix) {
    prompt = `${prompt}${preset.promptSuffix}`;
  }

  const startTime = Date.now();
  const model = resolveStudioApiModel(parsed.model);
  const googleImage = isGoogleStudioImageModel(model);
  const cloudUrl = studioCloudImageUrl(prompt, parsed.size, parsed.seed);
  const cloudPayload = {
    created: Math.floor(Date.now() / 1000),
    data: [{ url: cloudUrl }],
    url: cloudUrl,
    mode,
    model,
    seed: parsed.seed,
    durationMs: Date.now() - startTime,
  };

  const failGoogle = (message: string, status = 502) =>
    NextResponse.json(
      {
        error: message,
        mode,
        model,
        seed: parsed.seed,
        durationMs: Date.now() - startTime,
      },
      { status }
    );

  const secret = studioGatewaySecret();
  if (!secret) {
    if (googleImage) {
      return failGoogle("Google image models need the Studio gateway. Flux fallback is disabled for Nano Banana.", 503);
    }
    return NextResponse.json(cloudPayload);
  }

  try {
    const image = parsed.image
      ? `data:${parsed.image.mime};base64,${Buffer.from(parsed.image.bytes).toString("base64")}`
      : undefined;
    const upstream = await fetch(`${studioGatewayUrl()}/v1/images/generations`, {
      method: "POST",
      headers: studioGatewayHeaders(orgId),
      body: JSON.stringify({
        mode,
        prompt,
        n: parsed.n,
        size: parsed.size,
        strength: parsed.strength,
        model,
        seed: parsed.seed,
        steps: parsed.steps,
        negative_prompt: parsed.negativePrompt,
        response_format: "b64_json",
        quality: parsed.quality,
        aspect_ratio: parsed.aspectRatio,
        image_size: parsed.imageSize,
        image,
      }),
    });
    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    if (!upstream.ok) {
      const raw = studioErrorMessage(data, "Image generation failed");
      if (upstream.status === 400) {
        return NextResponse.json({ error: raw }, { status: 400 });
      }
      if (googleImage) {
        return failGoogle(raw, upstream.status === 404 || upstream.status === 503 ? upstream.status : 502);
      }
      return NextResponse.json({ ...cloudPayload, durationMs: Date.now() - startTime });
    }
    return NextResponse.json({
      ...data,
      created: typeof data.created === "number" ? data.created : Math.floor(Date.now() / 1000),
      mode,
      model,
      seed: parsed.seed,
      durationMs: Date.now() - startTime,
    });
  } catch {
    if (googleImage) {
      return failGoogle("Nano Banana could not reach Google image generation.");
    }
    return NextResponse.json({ ...cloudPayload, durationMs: Date.now() - startTime });
  }
}
