import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deployments, modelCatalog } from "@opendoor/database";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { createContainerApp } from "@/lib/azure/deployer";

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;

  const db = getDb();
  const items = await db.query.deployments.findMany({
    where: eq(deployments.organizationId, orgId),
    orderBy: [desc(deployments.createdAt)],
  });

  return NextResponse.json({ deployments: items });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const body = await req.json();

  const { name, sourceType, sourceValue, cpu, memoryGb, replicas } = body;

  if (!name || !sourceType || !sourceValue) {
    return NextResponse.json(
      { error: "name, sourceType, and sourceValue are required" },
      400
    );
  }

  const db = getDb();

  // Resolve image URL and env vars based on source type
  let imageUrl = sourceValue;
  let envVars: Record<string, string> = {};

  if (sourceType === "catalog") {
    const catalogItem = await db.query.modelCatalog.findFirst({
      where: eq(modelCatalog.id, sourceValue),
    });
    if (!catalogItem) {
      return NextResponse.json({ error: "Catalog model not found" }, 404);
    }
    // Use our base image for catalog deployments
    imageUrl = "vllm/vllm-openai:latest";
    envVars = {
      MODEL_ID: catalogItem.huggingFaceRepo || catalogItem.modelId,
      PORT: "8000",
    };
  }

  const [deployment] = await db
    .insert(deployments)
    .values({
      organizationId: orgId,
      name: name.slice(0, 100),
      sourceType,
      sourceValue,
      cpu: cpu || "0.5",
      memoryGb: memoryGb || "1.0",
      replicas: replicas || 1,
      status: "pending",
    })
    .returning();

  await logAuditEvent({
    organizationId: orgId,
    userId: session.sub as string,
    action: "deployment.created",
    entityType: "deployment",
    entityId: deployment.id,
    metadata: { name, sourceType, sourceValue },
  });

  // Trigger async Azure deployment
  deployToAzure(deployment.id, name, imageUrl, envVars, {
    cpu: cpu || "0.5",
    memoryGb: memoryGb || "1.0",
    replicas: replicas || 1,
  }).catch((err) => {
    console.error("Azure deployment failed:", err);
  });

  return NextResponse.json({ deployment });
}

async function deployToAzure(
  deploymentId: string,
  name: string,
  imageUrl: string,
  envVars: Record<string, string>,
  compute: { cpu: string; memoryGb: string; replicas: number }
) {
  const db = getDb();

  try {
    // Update status to building
    await db
      .update(deployments)
      .set({ status: "building", updatedAt: new Date() })
      .where(eq(deployments.id, deploymentId));

    const { fqdn, resourceId } = await createContainerApp(
      `opendoor-${deploymentId.slice(0, 8)}`,
      imageUrl,
      envVars,
      compute
    );

    // Update deployment with running status
    await db
      .update(deployments)
      .set({
        status: "running",
        fqdn,
        azureResourceId: resourceId,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));
  } catch (error: any) {
    await db
      .update(deployments)
      .set({
        status: "failed",
        statusMessage: error.message,
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId));
  }
}
