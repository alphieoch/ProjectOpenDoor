import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { detectGpuStatus } from "@/lib/gpu/detect";

export async function GET() {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();

    const orgRecord = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { id: true, metadata: true },
    });
    const meta = (orgRecord?.metadata as Record<string, unknown>) || {};
    const live = await detectGpuStatus();
    const projectId =
      (typeof meta.googleProjectId === "string" && meta.googleProjectId) ||
      live.gcp.project ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      null;
    const configured = Boolean(live.gcp.authenticated && projectId);

    return NextResponse.json({
      googleMcp: {
        enabled: configured,
        projectId,
        workspaceDomain:
          typeof meta.googleWorkspaceDomain === "string" ? meta.googleWorkspaceDomain : null,
        serviceAccount:
          typeof meta.googleServiceAccount === "string" ? meta.googleServiceAccount : null,
        status: configured ? "connected" : "not_configured",
        lastSync: typeof meta.googleMcpLastSync === "string" ? meta.googleMcpLastSync : null,
        account: live.gcp.account,
        region: live.gcp.region,
        authenticated: live.gcp.authenticated,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load GCP status";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const db = getDb();
    const body = await req.json().catch(() => ({}));
    const { action, projectId, workspaceDomain } = body;

    if (action !== "sync_iam" && action !== "update_config") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const live = await detectGpuStatus();
    const orgRecord = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!orgRecord) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const nextProject =
      (typeof projectId === "string" && projectId.trim()) ||
      live.gcp.project ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      null;
    if (!nextProject) {
      return NextResponse.json(
        { error: "No GCP project. Set GOOGLE_CLOUD_PROJECT or sign in with gcloud." },
        { status: 400 },
      );
    }

    const meta = (orgRecord.metadata as Record<string, unknown>) || {};
    const updatedMeta = {
      ...meta,
      googleProjectId: nextProject,
      googleWorkspaceDomain:
        (typeof workspaceDomain === "string" && workspaceDomain.trim()) ||
        meta.googleWorkspaceDomain ||
        null,
      googleMcpLastSync: new Date().toISOString(),
    };
    await db.update(organizations).set({ metadata: updatedMeta }).where(eq(organizations.id, orgId));

    return NextResponse.json({
      success: true,
      syncedAt: updatedMeta.googleMcpLastSync,
      projectId: nextProject,
      authenticated: live.gcp.authenticated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update GCP project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
