import { NextRequest, NextResponse } from "next/server";
import { PRIVATE_GPU_OFFLINE } from "@opendoor/shared";
import { requireAuth } from "@/lib/auth";
import {
  STUDIO_IMAGE_MAX_BYTES,
  STYLE_PRESETS,
  readStudioRequest,
  studioGatewayHeaders,
  studioGatewayUrl,
  studioOfflineError,
} from "@/lib/studio";
import { forbidProtectedChild } from "@/lib/parent-protection";

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const blocked = await forbidProtectedChild(session);
  if (blocked) return blocked;
  const orgId = session.orgId as string;
  const parsed = await readStudioRequest(req);

  if (!parsed.mode) {
    return NextResponse.json(
      { error: "mode is required", message: 'Set mode to "txt2img" or "img2img". Use POST /api/studio/video for v2v.' },
      { status: 400 }
    );
  }
  if (parsed.mode === "v2v") {
    return NextResponse.json(
      { error: "Use POST /api/studio/video for video to video", mode: "v2v" },
      { status: 400 }
    );
  }

  let prompt = parsed.prompt;
  if (parsed.mode === "txt2img" && !prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (parsed.mode === "img2img" && !parsed.image) {
    return NextResponse.json({ error: "image is required for img2img" }, { status: 400 });
  }
  if (parsed.mode === "img2img" && !prompt) {
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
  const gateway = studioGatewayUrl();
  const secret = process.env.GATEWAY_INTERNAL_KEY || process.env.INTERNAL_API_KEY || "";
  if (!secret) {
    return NextResponse.json({ error: PRIVATE_GPU_OFFLINE }, { status: 503 });
  }

  try {
    const image = parsed.image
      ? `data:${parsed.image.mime};base64,${Buffer.from(parsed.image.bytes).toString("base64")}`
      : undefined;
    const upstream = await fetch(`${gateway}/v1/images/generations`, {
      method: "POST",
      headers: studioGatewayHeaders(orgId),
      body: JSON.stringify({
        mode: parsed.mode,
        prompt,
        size: parsed.size,
        strength: parsed.strength,
        model: parsed.model,
        seed: parsed.seed,
        steps: parsed.steps,
        negative_prompt: parsed.negativePrompt,
        response_format: "b64_json",
        image,
      }),
    });
    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    if (!upstream.ok) {
      const raw =
        typeof data.error === "string"
          ? data.error
          : typeof data.message === "string"
            ? data.message
            : PRIVATE_GPU_OFFLINE;
      const status = upstream.status === 400 ? 400 : upstream.status === 503 ? 503 : 502;
      return NextResponse.json({ error: studioOfflineError(raw) }, { status });
    }
    return NextResponse.json({
      ...data,
      created: typeof data.created === "number" ? data.created : Math.floor(Date.now() / 1000),
      mode: parsed.mode,
      model: parsed.model,
      seed: parsed.seed,
      durationMs: Date.now() - startTime,
    });
  } catch {
    return NextResponse.json({ error: PRIVATE_GPU_OFFLINE }, { status: 503 });
  }
}
