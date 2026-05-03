// @ts-nocheck
import { Hono } from "hono";
import { listProviders } from "../providers/index.js";
import { CustomDeploymentProvider } from "../providers/custom-deployment.js";
import { db, deployments, models as modelsTable } from "@opendoor/database";
import { eq, and, inArray } from "drizzle-orm";

const modelsRouter = new Hono();

modelsRouter.get("/", async (c) => {
  const providers = listProviders();
  const allModels: any[] = [];

  for (const p of providers) {
    if (p.slug === "custom") continue;
    allModels.push(await p.listModels());
  }

  // Include custom deployments for the authenticated organization
  try {
    const organization = c.get("organization");
    if (organization) {
      const customProvider = providers.find((p) => p.slug === "custom") as CustomDeploymentProvider | undefined;
      if (customProvider && customProvider.listModelsForOrg) {
        const customModels = await customProvider.listModelsForOrg(organization.id);
        allModels.push(customModels);
      }
    }
  } catch {
    // ignore if no org context
  }

  const flatModels = allModels.flat();
  const modelIds = flatModels.map((m) => m.id);

  // Fetch deployment statuses from DB
  let statusMap = new Map<string, string>();
  try {
    const dbModels = await db
      .select({ modelId: modelsTable.modelId, status: modelsTable.deploymentStatus })
      .from(modelsTable);
    for (const row of dbModels) {
      if (row.status) statusMap.set(row.modelId, row.status);
    }
  } catch (err: any) {
    console.log("[models] Failed to fetch deployment statuses:", err.message);
  }

  const models = flatModels.map((m) => ({
    id: m.id,
    object: "model",
    created: m.created,
    owned_by: m.owned_by,
    provider: m.provider,
    deployment_status: statusMap.get(m.id) || "live",
    display_name: m.display_name,
    supports_vision: m.supports_vision,
    supports_tools: m.supports_tools,
    supports_json_mode: m.supports_json_mode,
  }));

  return c.json({
    object: "list",
    data: models,
  });
});

export default modelsRouter;
