import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deployments } from "@opendoor/database";
import { and, eq } from "drizzle-orm";
import { ensureGcpModel } from "@/lib/gcp/ensure-model";
import { gcpAvailable } from "@/lib/gcp/hf-repo";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deploymentId = req.nextUrl.searchParams.get("deploymentId");
  if (!deploymentId) {
    return NextResponse.json({ error: "deploymentId is required" }, { status: 400 });
  }

  const db = getDb();
  const row = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, deploymentId), eq(deployments.organizationId, session.orgId as string)),
  });
  if (!row) return NextResponse.json({ error: "Deployment not found" }, { status: 404 });

  return NextResponse.json({
    model: `custom:${row.id}`,
    deploymentId: row.id,
    status: row.status,
    statusMessage: row.statusMessage,
    fqdn: row.fqdn,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!gcpAvailable()) {
    return NextResponse.json(
      { error: "GCP_PROJECT_ID is not set. Add it to .env so playground models can run on Google Cloud." },
      { status: 400 },
    );
  }

  let body: { modelId?: string };
  try {
    body = (await req.json()) as { modelId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const modelId = (body.modelId || "").trim();
  if (!modelId) return NextResponse.json({ error: "modelId is required" }, { status: 400 });

  try {
    const result = await ensureGcpModel({
      orgId: session.orgId as string,
      modelId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start Google Cloud GPU";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
