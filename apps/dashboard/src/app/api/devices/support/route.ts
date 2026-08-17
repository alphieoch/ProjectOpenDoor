import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { modelCatalog, models } from "@opendoor/database";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasDeviceInventoryConsent } from "@/lib/gpu/consent";
import { detectGpuStatus } from "@/lib/gpu/detect";
import { assessDeviceSupport } from "@/lib/gpu/support";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (!(await hasDeviceInventoryConsent(session))) {
    return NextResponse.json(
      { error: "device_inventory_consent_required", granted: false },
      { status: 403 }
    );
  }
  const modelId = req.nextUrl.searchParams.get("modelId")?.trim();
  if (!modelId) {
    return NextResponse.json({ error: "modelId is required" }, { status: 400 });
  }

  const db = getDb();
  const [status, catalog, model] = await Promise.all([
    detectGpuStatus(),
    db.query.modelCatalog.findFirst({
      where: eq(modelCatalog.modelId, modelId),
      columns: {
        displayName: true,
        minGpuMemoryGb: true,
        ollamaTag: true,
        source: true,
        serverless: true,
      },
    }),
    db.query.models.findFirst({
      where: eq(models.modelId, modelId),
      columns: {
        displayName: true,
        family: true,
        source: true,
        serverless: true,
        ollamaTag: true,
      },
    }),
  ]);

  const support = assessDeviceSupport({
    status,
    modelId,
    label: model?.displayName || catalog?.displayName || modelId,
    family: model?.family,
    source: model?.source || catalog?.source,
    serverless: Boolean(model?.serverless || catalog?.serverless),
    ollamaTag: model?.ollamaTag || catalog?.ollamaTag,
    catalogMinGb: catalog?.minGpuMemoryGb != null ? Number(catalog.minGpuMemoryGb) : null,
  });

  return NextResponse.json({
    modelId,
    device: {
      appleSilicon: status.local.appleSilicon,
      ollamaInstalled: status.local.ollamaInstalled,
      ollamaRunning: status.local.ollamaRunning,
      models: status.local.models,
      hardware: status.local.hardware,
    },
    support,
  });
}
