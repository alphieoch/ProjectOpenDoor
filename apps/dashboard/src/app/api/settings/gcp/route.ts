import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { detectGpuStatus } from "@/lib/gpu/detect";

export async function GET() {
  try {
    await requireAuth();
    const live = await detectGpuStatus();
    const projectId = live.gcp.project || process.env.GOOGLE_CLOUD_PROJECT || null;

    return NextResponse.json({
      gcp: {
        installed: live.gcp.authenticated || Boolean(projectId),
        authenticated: live.gcp.authenticated,
        account: live.gcp.account,
        projectId,
        region: live.gcp.region,
        vertexReady: Boolean(live.gcp.runApiLikely),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to probe GCP";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({
      success: false,
      error: "Project is read from GOOGLE_CLOUD_PROJECT or gcloud config. This endpoint does not persist secrets.",
      requestedProjectId: typeof body.projectId === "string" ? body.projectId : null,
    }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to update GCP configuration" }, { status: 500 });
  }
}
