import { NextRequest, NextResponse } from "next/server";
import { PRIVATE_GPU_OFFLINE } from "@opendoor/shared";
import { requireAuth } from "@/lib/auth";
import {
  STUDIO_VIDEO_MAX_BYTES,
  readStudioRequest,
  studioGatewayHeaders,
  studioGatewayUrl,
  studioOfflineError,
} from "@/lib/studio";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const gateway = studioGatewayUrl();
  const secret = process.env.GATEWAY_INTERNAL_KEY || process.env.INTERNAL_API_KEY || "";
  if (!secret) {
    return NextResponse.json({ error: PRIVATE_GPU_OFFLINE, id, status: "failed" }, { status: 503 });
  }

  try {
    const upstream = await fetch(`${gateway}/v1/videos/generations/${encodeURIComponent(id)}`, {
      headers: studioGatewayHeaders(orgId),
    });
    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    if (!upstream.ok) {
      const raw =
        typeof data.error === "string"
          ? data.error
          : typeof data.message === "string"
            ? data.message
            : "Video job not found";
      return NextResponse.json(
        { error: studioOfflineError(raw), id, status: "failed", ...data },
        { status: upstream.status === 409 ? 409 : upstream.status === 404 ? 404 : 502 }
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: PRIVATE_GPU_OFFLINE, id, status: "failed" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const parsed = await readStudioRequest(req);

  const videoModes = ["txt2vid", "img2vid", "v2v"];
  if (parsed.mode && !videoModes.includes(parsed.mode)) {
    return NextResponse.json(
      { error: "Use POST /api/studio/generate for txt2img and img2img", mode: parsed.mode },
      { status: 400 }
    );
  }

  const mode = parsed.mode || (parsed.video ? "v2v" : parsed.image ? "img2vid" : "txt2vid");

  if (mode === "txt2vid" && !parsed.prompt.trim()) {
    return NextResponse.json({ error: "Prompt is required for text to video" }, { status: 400 });
  }

  if (mode === "img2vid" && !parsed.image) {
    return NextResponse.json({ error: "Reference image is required for image to video" }, { status: 400 });
  }

  if (mode === "v2v" && !parsed.video && !parsed.image) {
    return NextResponse.json({ error: "Video file is required for video editing" }, { status: 400 });
  }

  const media = mode === "v2v" ? (parsed.video || parsed.image) : parsed.image;
  if (media && media.bytes.length > STUDIO_VIDEO_MAX_BYTES) {
    return NextResponse.json({ error: "Media file exceeds 48MB limit" }, { status: 400 });
  }

  let prompt = parsed.prompt || (mode === "v2v" ? "keep motion, refine the look" : "cinematic fluid camera motion");
  if (mode === "v2v" && parsed.targetTime != null) {
    const formattedSec = parsed.targetTime.toFixed(1);
    prompt = `[At timestamp ${formattedSec}s]: ${prompt}`;
  } else if (mode === "v2v" && parsed.startTime != null && parsed.endTime != null) {
    const startSec = parsed.startTime.toFixed(1);
    const endSec = parsed.endTime.toFixed(1);
    prompt = `[Between ${startSec}s and ${endSec}s]: ${prompt}`;
  }

  const startTime = Date.now();
  const gateway = studioGatewayUrl();
  const secret = process.env.GATEWAY_INTERNAL_KEY || process.env.INTERNAL_API_KEY || "";
  if (!secret) {
    return NextResponse.json({ error: PRIVATE_GPU_OFFLINE }, { status: 503 });
  }

  try {
    const form = new FormData();
    form.set("mode", mode);
    form.set("prompt", prompt);
    form.set("size", parsed.size || "1280x720");
    form.set("strength", String(parsed.strength));
    form.set("model", parsed.model);
    form.set("seed", String(parsed.seed));
    form.set("steps", String(parsed.steps));
    form.set("negative_prompt", parsed.negativePrompt);
    if (parsed.targetTime != null) form.set("target_time", String(parsed.targetTime));
    if (parsed.startTime != null) form.set("start_time", String(parsed.startTime));
    if (parsed.endTime != null) form.set("end_time", String(parsed.endTime));
    if (parsed.duration != null) form.set("duration", String(parsed.duration));

    if (media) {
      const copy = new Uint8Array(media.bytes.byteLength);
      copy.set(media.bytes);
      const fieldName = mode === "img2vid" ? "image" : "video";
      form.set(fieldName, new Blob([copy], { type: media.mime }), media.filename);
    }

    const upstream = await fetch(`${gateway}/v1/videos/generations`, {
      method: "POST",
      headers: studioGatewayHeaders(orgId, false),
      body: form,
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
      id: typeof data.id === "string" ? data.id : `${mode}-${Date.now()}`,
      status: typeof data.status === "string" ? data.status : "completed",
      mode,
      model: parsed.model,
      seed: parsed.seed,
      durationMs: Date.now() - startTime,
    });
  } catch {
    return NextResponse.json({ error: PRIVATE_GPU_OFFLINE }, { status: 503 });
  }
}
