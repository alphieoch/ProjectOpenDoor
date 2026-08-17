// @ts-nocheck
import { Hono } from "hono";
import { instantiateProvider, listProviders } from "../providers/index.js";
import { CustomDeploymentProvider } from "../providers/custom-deployment.js";
import { db, models as modelsTable, pricingRules } from "@opendoor/database";
import { loadOrgProviderKeys } from "../lib/byok.js";
import { listedImageModels, listedVideoModels, vertexMediaConfigured } from "../lib/vertex-media.js";

const modelsRouter = new Hono();

function supportedParams(m: any): string[] {
  const params = ["temperature", "max_tokens", "top_p", "stream"];
  if (m.supports_tools) params.push("tools", "tool_choice");
  if (m.supports_json_mode) params.push("response_format");
  if (m.supports_vision) params.push("image_url");
  return params;
}

function architecture(m: any) {
  if (m.architecture?.modality) return m.architecture;
  const id = String(m.id || "");
  if (/imagen|dall-e|gpt-image|gemini-.*-image/i.test(id)) {
    return { modality: "image", input_modalities: ["text", "image"], output_modalities: ["image"] };
  }
  if (/^veo-/i.test(id)) {
    return { modality: "video", input_modalities: ["text", "image"], output_modalities: ["video"] };
  }
  const modality = m.supports_rerank
    ? "rerank"
    : m.id?.includes("embed") || m.id?.includes("bge-base")
      ? "embedding"
      : "text";
  const input = ["text"];
  const output = modality === "embedding" ? ["embedding"] : ["text"];
  if (m.supports_vision) input.push("image");
  return { modality, input_modalities: input, output_modalities: output };
}

modelsRouter.get("/", async (c) => {
  const providers = listProviders();
  const allModels: any[] = [];
  const seenProviders = new Set<string>();

  for (const p of providers) {
    if (p.slug === "custom") continue;
    seenProviders.add(p.slug);
    allModels.push(await p.listModels());
  }

  try {
    const organization = c.get("organization");
    if (organization) {
      const customProvider = providers.find((p) => p.slug === "custom") as
        | CustomDeploymentProvider
        | undefined;
      if (customProvider && customProvider.listModelsForOrg) {
        const customModels = await customProvider.listModelsForOrg(organization.id);
        allModels.push(customModels);
      }

      const byok = await loadOrgProviderKeys(organization.id);
      for (const [slug, key] of byok) {
        if (seenProviders.has(slug)) continue;
        const adapter = instantiateProvider(slug, key.plaintext);
        if (!adapter || adapter.slug === "custom") continue;
        seenProviders.add(slug);
        allModels.push(await adapter.listModels());
      }
    }
  } catch {
    // ignore if no org context
  }

  const flatModels = allModels.flat();
  if (vertexMediaConfigured()) {
    const now = Math.floor(Date.now() / 1000);
    for (const m of listedImageModels()) {
      if (flatModels.some((row: any) => row.id === m.id)) continue;
      flatModels.push({
        id: m.id,
        object: "model",
        created: now,
        owned_by: "google",
        provider: "vertex",
        display_name: m.display_name,
        architecture: {
          modality: "image",
          input_modalities: ["text", "image"],
          output_modalities: ["image"],
        },
      });
    }
    for (const m of listedVideoModels()) {
      if (flatModels.some((row: any) => row.id === m.id)) continue;
      flatModels.push({
        id: m.id,
        object: "model",
        created: now,
        owned_by: "google",
        provider: "vertex",
        display_name: m.display_name,
        architecture: {
          modality: "video",
          input_modalities: ["text", "image"],
          output_modalities: ["video"],
        },
      });
    }
  }

  let statusMap = new Map<string, string>();
  let catalogMap = new Map<string, any>();
  let priceMap = new Map<string, { prompt: number; completion: number }>();
  try {
    const dbModels = await db
      .select({
        modelId: modelsTable.modelId,
        status: modelsTable.deploymentStatus,
        contextWindow: modelsTable.contextWindow,
        supportsVision: modelsTable.supportsVision,
        supportsTools: modelsTable.supportsTools,
        supportsJsonMode: modelsTable.supportsJsonMode,
        family: modelsTable.family,
        serverless: modelsTable.serverless,
        displayName: modelsTable.displayName,
      })
      .from(modelsTable);
    for (const row of dbModels) {
      if (row.status) statusMap.set(row.modelId, row.status);
      catalogMap.set(row.modelId, row);
    }
    const prices = await db
      .select({
        modelId: pricingRules.modelId,
        input: pricingRules.finalInputCostPer1K,
        output: pricingRules.finalOutputCostPer1K,
      })
      .from(pricingRules);
    for (const row of prices) {
      if (!priceMap.has(row.modelId)) {
        priceMap.set(row.modelId, {
          prompt: Number(row.input) * 1000,
          completion: Number(row.output) * 1000,
        });
      }
    }
  } catch (err: any) {
    console.log("[models] Failed to fetch catalog enrichments:", err.message);
  }

  const models = flatModels.map((m) => {
    const catalog = catalogMap.get(m.id);
    const price = priceMap.get(m.id);
    const contextWindow = m.context_window ?? catalog?.contextWindow ?? undefined;
    const supportsVision = m.supports_vision ?? catalog?.supportsVision;
    const supportsTools = m.supports_tools ?? catalog?.supportsTools;
    const supportsJsonMode = m.supports_json_mode ?? catalog?.supportsJsonMode;
    const enriched = {
      ...m,
      context_window: contextWindow,
      supports_vision: supportsVision,
      supports_tools: supportsTools,
      supports_json_mode: supportsJsonMode,
    };
    return {
      id: m.id,
      object: "model",
      created: m.created,
      owned_by: m.owned_by,
      provider: m.provider,
      deployment_status: statusMap.get(m.id) || "live",
      display_name: m.display_name || catalog?.displayName,
      context_window: contextWindow,
      supports_vision: supportsVision,
      supports_tools: supportsTools,
      supports_json_mode: supportsJsonMode,
      pricing: price
        ? {
            prompt: price.prompt,
            completion: price.completion,
            prompt_per_token: (price.prompt / 1_000_000).toPrecision(8),
            completion_per_token: (price.completion / 1_000_000).toPrecision(8),
          }
        : undefined,
      architecture: architecture(enriched),
      supported_parameters: supportedParams(enriched),
      top_provider: { slug: m.provider },
      serverless: catalog?.serverless ?? (m.provider === "together" || m.provider === "vertex"),
    };
  });

  return c.json({
    object: "list",
    data: models,
  });
});

export default modelsRouter;
