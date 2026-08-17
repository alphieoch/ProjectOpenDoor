import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deployments, deploymentLoras } from "@opendoor/database";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { loadLoraOnEndpoint, unloadLoraOnEndpoint } from "@/lib/gpu/lora";

async function getOwnedDeployment(orgId: string, deploymentId: string) {
  const db = getDb();
  return db.query.deployments.findFirst({
    where: and(eq(deployments.id, deploymentId), eq(deployments.organizationId, orgId)),
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;

  const deployment = await getOwnedDeployment(orgId, id);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const db = getDb();
  const loras = await db
    .select()
    .from(deploymentLoras)
    .where(eq(deploymentLoras.deploymentId, id))
    .orderBy(desc(deploymentLoras.createdAt));

  return NextResponse.json({ loras });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const adapterUri =
    typeof body.adapterUri === "string"
      ? body.adapterUri.trim()
      : typeof body.adapter_uri === "string"
        ? body.adapter_uri.trim()
        : "";

  if (!name || !adapterUri) {
    return NextResponse.json(
      { error: "name and adapterUri are required (HF repo or path)" },
      { status: 400 }
    );
  }

  const deployment = await getOwnedDeployment(orgId, id);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  if (deployment.status !== "running" || !deployment.fqdn) {
    return NextResponse.json(
      { error: "Deployment must be running with an endpoint before loading LoRA" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [row] = await db
    .insert(deploymentLoras)
    .values({
      deploymentId: id,
      name,
      adapterUri,
      status: "loading",
    })
    .returning();

  let status = "loaded";
  let detail: string | undefined;

  if (deployment.target === "local" || deployment.localRuntime === "ollama") {
    status = "unsupported";
    detail =
      "Multi-LoRA load requires a vLLM endpoint (GCP). Local Ollama does not expose load_lora_adapter.";
  } else {
    const result = await loadLoraOnEndpoint({
      fqdn: deployment.fqdn,
      name,
      adapterUri,
    });
    if (!result.ok) {
      status = "failed";
      detail = result.detail;
    }
  }

  const [updated] = await db
    .update(deploymentLoras)
    .set({
      status,
      loadedAt: status === "loaded" ? new Date() : null,
      metadata: detail ? { detail } : null,
      updatedAt: new Date(),
    })
    .where(eq(deploymentLoras.id, row.id))
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "deployment.lora_loaded",
    entityType: "deployment_lora",
    entityId: row.id,
    metadata: { deploymentId: id, name, status },
  });

  const callAs =
    status === "loaded" ? `custom:${id}/${name}` : undefined;

  return NextResponse.json(
    { lora: updated, modelId: callAs, detail },
    { status: status === "failed" ? 502 : 201 }
  );
}
