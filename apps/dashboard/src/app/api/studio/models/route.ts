import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { OPENDOOR_STUDIO_MODELS, studioGpuStatus } from "@/lib/studio";

export async function GET() {
  try {
    const session = await requireAuth();
    const status = await studioGpuStatus(session.orgId as string);

    // Filter and decorate models with live GPU status
    const models = OPENDOOR_STUDIO_MODELS.map((model) => {
      let isAvailable = true;
      if (model.category === "video" && !status.video.ready && !status.hasVertex) {
        isAvailable = false;
      }
      if (model.provider === "private-gpu" && !status.hasGpu) {
        isAvailable = false;
      }
      return {
        ...model,
        isAvailable,
      };
    });

    return NextResponse.json({
      models,
      activeEngine: status.engine,
      hasGpu: status.hasGpu,
      videoReady: status.video.ready,
      timestamp: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      models: OPENDOOR_STUDIO_MODELS,
      activeEngine: "offline",
      hasGpu: false,
      videoReady: false,
      timestamp: Date.now(),
    });
  }
}
