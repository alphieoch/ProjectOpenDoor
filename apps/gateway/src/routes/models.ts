import { Hono } from "hono";
import { listProviders } from "../providers/index.js";

const modelsRouter = new Hono();

modelsRouter.get("/", async (c) => {
  const providers = listProviders();
  const allModels: any[] = [];
  for (const p of providers) {
    allModels.push(await p.listModels());
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
