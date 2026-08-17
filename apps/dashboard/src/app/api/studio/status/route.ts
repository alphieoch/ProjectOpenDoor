import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { OPENDOOR_STUDIO_MODELS, studioGpuStatus } from "@/lib/studio";

export async function GET() {
  try {
    const session = await requireAuth();
    const status = await studioGpuStatus(session.orgId as string);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      online: false,
      pipelineReady: false,
      engine: "Studio offline",
      label: "Studio is offline",
      configured: false,
      models: OPENDOOR_STUDIO_MODELS,
      hasGpu: false,
      hasVertex: false,
      video: {
        ready: false,
        missingNodes: [],
      },
    });
  }
}
