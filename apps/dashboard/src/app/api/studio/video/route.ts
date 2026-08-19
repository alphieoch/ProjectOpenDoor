import { NextRequest, NextResponse } from "next/server";
import { PRIVATE_GPU_OFFLINE } from "@opendoor/shared";
import { requireAuth } from "@/lib/auth";
import {
  STUDIO_VIDEO_MAX_BYTES,
  readStudioRequest,
  resolveStudioVideoModel,
  studioErrorMessage,
  studioGatewayHeaders,
  studioGatewaySecret,
  studioGatewayUrl,
  studioOfflineError,
} from "@/lib/studio";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchVideoJob(orgId: string, id: string) {
  const upstream = await fetch(`${studioGatewayUrl()}/v1/videos/generations/${encodeURIComponent(id)}`, {
    headers: studioGatewayHeaders(orgId),
  });
  const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
  return { upstream, data };
}

async function fetchVideoBytes(orgId: string, id: string) {
  const upstream = await fetch(`${studioGatewayUrl()}/v1/videos/generations/${encodeURIComponent(id)}/content`, {
    headers: studioGatewayHeaders(orgId),
  });
  if (!upstream.ok) {
    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    return { error: studioErrorMessage(data, "Video is not ready"), status: upstream.status, bytes: null as Buffer | null };
  }
  return { error: null, status: 200, bytes: Buffer.from(await upstream.arrayBuffer()) };
}

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const id = req.nextUrl.searchParams.get("id");
  const raw = req.nextUrl.searchParams.get("raw") === "1";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const secret = studioGatewaySecret();
  if (!secret) {
    return NextResponse.json({ error: PRIVATE_GPU_OFFLINE, id, status: "failed" }, { status: 503 });
  }

  try {
    if (raw) {
      const content = await fetchVideoBytes(orgId, id);
      if (!content.bytes) {
        return NextResponse.json(
          { error: content.error, id, status: "failed" },
          { status: content.status === 409 ? 409 : content.status === 404 ? 404 : 502 }
        );
      }
      return new NextResponse(new Uint8Array(content.bytes), {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Cache-Control": "private, max-age=120",
        },
      });
    }

    const { upstream, data } = await fetchVideoJob(orgId, id);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: studioOfflineError(studioErrorMessage(data, "Video job not found")), id, status: "failed", ...data },
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
  const model = resolveStudioVideoModel(parsed.model);

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
  const fail = (message: string, status = 502) =>
    NextResponse.json(
      {
        error: message,
        id: `${mode}-${Date.now()}`,
        status: "failed",
        mode,
        model,
        seed: parsed.seed,
        durationMs: Date.now() - startTime,
      },
      { status }
    );

  const secret = studioGatewaySecret();
  if (!secret) {
    return fail("Studio gateway is not configured for video. The sample flower clip is disabled.", 503);
  }

  try {
    const form = new FormData();
    form.set("mode", mode);
    form.set("prompt", prompt);
    form.set("size", parsed.size || "1280x720");
    form.set("strength", String(parsed.strength));
    form.set("model", model);
    form.set("quality", parsed.quality);
    if (parsed.aspectRatio) form.set("aspect_ratio", parsed.aspectRatio);
    form.set("seed", String(parsed.seed));
    form.set("steps", String(parsed.steps));
    form.set("negative_prompt", parsed.negativePrompt);
    form.set("n", String(parsed.n || 1));
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

    const upstream = await fetch(`${studioGatewayUrl()}/v1/videos/generations`, {
      method: "POST",
      headers: studioGatewayHeaders(orgId, false),
      body: form,
    });
    let data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    if (!upstream.ok) {
      return fail(studioErrorMessage(data, "Video generation failed"), upstream.status === 400 || upstream.status === 404 || upstream.status === 503 ? upstream.status : 502);
    }

    const id = typeof data.id === "string" ? data.id : "";
    if ((data.status === "processing" || data.status === "queued") && id) {
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline) {
        await sleep(2500);
        const polled = await fetchVideoJob(orgId, id);
        data = polled.data;
        if (data.status === "completed" || data.status === "failed") break;
      }
    }

    if (data.status === "failed") {
      return fail(studioErrorMessage(data, "Video generation failed"));
    }

    if (id && data.status === "completed") {
      const content = await fetchVideoBytes(orgId, id);
      if (content.bytes) {
        const url = `data:video/mp4;base64,${content.bytes.toString("base64")}`;
        return NextResponse.json({
          ...data,
          created: typeof data.created === "number" ? data.created : Math.floor(Date.now() / 1000),
          id,
          status: "completed",
          url,
          data: [{ url, mime: "video/mp4" }],
          mode,
          model,
          seed: parsed.seed,
          durationMs: Date.now() - startTime,
        });
      }
    }

    if (id && (data.status === "processing" || data.status === "queued")) {
      return NextResponse.json({
        ...data,
        id,
        status: data.status,
        url: `/api/studio/video?id=${encodeURIComponent(id)}&raw=1`,
        mode,
        model,
        seed: parsed.seed,
        durationMs: Date.now() - startTime,
      });
    }

    const row = Array.isArray(data.data) ? (data.data[0] as Record<string, unknown> | undefined) : undefined;
    const inline =
      typeof row?.b64_json === "string"
        ? `data:${typeof row.mime === "string" ? row.mime : "video/mp4"};base64,${row.b64_json}`
        : typeof row?.url === "string"
          ? row.url
          : typeof data.url === "string"
            ? data.url
            : null;
    if (inline && !/flower\.mp4/i.test(inline)) {
      return NextResponse.json({
        ...data,
        created: typeof data.created === "number" ? data.created : Math.floor(Date.now() / 1000),
        id: id || `${mode}-${Date.now()}`,
        status: "completed",
        url: inline,
        data: [{ url: inline }],
        mode,
        model,
        seed: parsed.seed,
        durationMs: Date.now() - startTime,
      });
    }

    return fail(studioErrorMessage(data, "Video generation did not return a clip for this prompt."));
  } catch {
    return fail("Video generation could not reach Veo.");
  }
}
