// @ts-nocheck
import { Hono } from "hono";
import { listProviders } from "../providers/index.js";
import { CustomDeploymentProvider } from "../providers/custom-deployment.js";
import { db, deployments } from "@opendoor/database";
import { eq, and } from "drizzle-orm";

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

  const models = allModels.flat().map((m) => ({
    id: m.id,
    object: "model",
    created: m.created,
    owned_by: m.owned_by,
  }));

  return c.json({
    object: "list",
    data: models,
  });
});

export default modelsRouter;
