import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { modelCatalog, models, providers } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { formatBytes, planWeightImport } from "@/lib/models/import-weights";

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const source = typeof body.source === "string" ? body.source : "";
  const action = body.action === "list" ? "list" : "preview";

  try {
    const plan = await planWeightImport(source);
    if (action === "preview") {
      return NextResponse.json({
        plan,
        sizeLabel: formatBytes(plan.estimatedBytes),
      });
    }

    const db = getDb();
    const ollama = await db.query.providers.findFirst({
      where: eq(providers.slug, "ollama"),
    });
    const qwen = await db.query.providers.findFirst({
      where: eq(providers.slug, "qwen"),
    });

    const status =
      plan.recommended === "local"
        ? "dedicated"
        : plan.recommended === "gcp"
          ? "dedicated"
          : plan.recommended === "api"
            ? "live"
            : "warming";

    const [catalog] = await db
      .insert(modelCatalog)
      .values({
        modelId: plan.modelId,
        displayName: plan.displayName,
        description: `Imported by workspace from ${plan.repo}. ${plan.reason}`,
        huggingFaceRepo: plan.kind === "huggingface" ? plan.repo : null,
        ollamaTag: plan.ollamaPull,
        inferenceEngine: plan.recommended === "local" ? "ollama" : "vllm",
        defaultCpu: plan.recommended === "gcp" ? "4.0" : "2.0",
        defaultMemoryGb: plan.recommended === "gcp" ? "16.0" : "4.0",
        origin: plan.origin,
        source: plan.kind === "ollama" ? "ollama" : "huggingface",
        deploymentStatus: status,
        serverless: plan.recommended === "api",
        listedAt: new Date(),
        enabled: true,
      })
      .onConflictDoUpdate({
        target: modelCatalog.modelId,
        set: {
          displayName: plan.displayName,
          description: `Imported by workspace from ${plan.repo}. ${plan.reason}`,
          huggingFaceRepo: plan.kind === "huggingface" ? plan.repo : null,
          ollamaTag: plan.ollamaPull,
          origin: plan.origin,
          source: plan.kind === "ollama" ? "ollama" : "huggingface",
          deploymentStatus: status,
          serverless: plan.recommended === "api",
          listedAt: new Date(),
          enabled: true,
        },
      })
      .returning();

    if (ollama) {
      await db
        .insert(models)
        .values({
          providerId: ollama.id,
          modelId: plan.ollamaPull || plan.modelId,
          displayName: plan.displayName,
          contextWindow: 128000,
          family: "open_weight",
          deploymentStatus: status,
          serverless: false,
          origin: plan.origin,
          source: plan.kind === "ollama" ? "ollama" : "huggingface",
          huggingFaceRepo: plan.kind === "huggingface" ? plan.repo : null,
          ollamaTag: plan.ollamaPull,
          listedAt: new Date(),
          enabled: true,
        })
        .onConflictDoNothing();
    }

    if (qwen && plan.apiModelId) {
      await db
        .insert(models)
        .values({
          providerId: qwen.id,
          modelId: plan.apiModelId,
          displayName: plan.displayName,
          contextWindow: 1000000,
          family: plan.recommended === "api" ? "closed" : "open_weight",
          deploymentStatus: plan.canServeViaApi ? "live" : "warming",
          serverless: plan.canServeViaApi,
          origin: "cn",
          source: "provider_api",
          huggingFaceRepo: plan.kind === "huggingface" ? plan.repo : null,
          listedAt: new Date(),
          enabled: true,
        })
        .onConflictDoNothing();
    }

    await logAuditEvent({
      organizationId: session.orgId as string,
      userId: session.sub as string,
      action: "model.imported",
      entityType: "model_catalog",
      entityId: catalog.id,
      metadata: {
        repo: plan.repo,
        recommended: plan.recommended,
        modelId: plan.modelId,
      },
    });

    return NextResponse.json({
      plan,
      sizeLabel: formatBytes(plan.estimatedBytes),
      catalog,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
