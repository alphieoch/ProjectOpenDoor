// @ts-nocheck
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import {
  db,
  deployments,
  deploymentLoras,
  deploymentRouters,
  deploymentRouterTargets,
} from "@opendoor/database";
import { eq, and } from "drizzle-orm";

function parseCustomModel(modelId: string): {
  deploymentId: string;
  loraName?: string;
} | null {
  if (!modelId.startsWith("custom:")) return null;
  const rest = modelId.slice("custom:".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return { deploymentId: rest };
  return {
    deploymentId: rest.slice(0, slash),
    loraName: rest.slice(slash + 1),
  };
}

function pickWeighted<T extends { weight: number }>(items: T[]): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (total <= 0) return items[0]!;
  let r = Math.random() * total;
  for (const item of items) {
    r -= Math.max(0, item.weight);
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

export class CustomDeploymentProvider implements ProviderAdapter {
  name = "Custom Deployment";
  slug = "custom";

  private async getDeployment(deploymentId: string) {
    return db.query.deployments.findFirst({
      where: and(eq(deployments.id, deploymentId), eq(deployments.status, "running")),
    });
  }

  /** Resolve router:slug → a running custom:deploymentId (weighted). */
  async resolveRouterModel(
    modelId: string,
    organizationId?: string
  ): Promise<string | null> {
    if (!modelId.startsWith("router:")) return null;
    const slug = modelId.slice("router:".length);
    const router = await db.query.deploymentRouters.findFirst({
      where: and(
        eq(deploymentRouters.slug, slug),
        eq(deploymentRouters.status, "active"),
        ...(organizationId
          ? [eq(deploymentRouters.organizationId, organizationId)]
          : [])
      ),
    });
    if (!router) return null;

    const targets = await db.query.deploymentRouterTargets.findMany({
      where: eq(deploymentRouterTargets.routerId, router.id),
    });
    if (targets.length === 0) return null;

    const running: Array<{ deploymentId: string; weight: number }> = [];
    for (const t of targets) {
      const d = await this.getDeployment(t.deploymentId);
      if (d) running.push({ deploymentId: t.deploymentId, weight: t.weight });
    }
    const picked = pickWeighted(running);
    return picked ? `custom:${picked.deploymentId}` : null;
  }

  private async resolveUpstreamModel(
    deploymentId: string,
    loraName?: string
  ): Promise<{ fqdn: string; model: string }> {
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment?.fqdn) {
      throw new Error(`Deployment not found or not running: ${deploymentId}`);
    }

    if (loraName) {
      const lora = await db.query.deploymentLoras.findFirst({
        where: and(
          eq(deploymentLoras.deploymentId, deploymentId),
          eq(deploymentLoras.name, loraName),
          eq(deploymentLoras.status, "loaded")
        ),
      });
      if (!lora) {
        throw new Error(
          `LoRA '${loraName}' is not loaded on deployment ${deploymentId}. Call model custom:${deploymentId}/${loraName} after loading.`
        );
      }
      return { fqdn: deployment.fqdn, model: loraName };
    }

    return {
      fqdn: deployment.fqdn,
      model: deployment.runtimeModel || "default",
    };
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    let modelId = request.model;
    if (modelId.startsWith("router:")) {
      const resolved = await this.resolveRouterModel(modelId);
      if (!resolved) throw new Error(`Router not found or no healthy targets: ${modelId}`);
      modelId = resolved;
    }

    const parsed = parseCustomModel(modelId);
    if (!parsed) throw new Error(`Invalid custom model id: ${request.model}`);

    const { fqdn, model } = await this.resolveUpstreamModel(
      parsed.deploymentId,
      parsed.loraName
    );

    const response = await fetch(`${fqdn.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, model }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Deployment error: ${err}`);
    }

    const data = await response.json();
    return {
      id: data.id || generateId(),
      object: "chat.completion",
      created: data.created || Math.floor(Date.now() / 1000),
      model: request.model,
      choices: data.choices || [],
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    let modelId = request.model;
    if (modelId.startsWith("router:")) {
      const resolved = await this.resolveRouterModel(modelId);
      if (!resolved) throw new Error(`Router not found or no healthy targets: ${modelId}`);
      modelId = resolved;
    }

    const parsed = parseCustomModel(modelId);
    if (!parsed) throw new Error(`Invalid custom model id: ${request.model}`);

    const { fqdn, model } = await this.resolveUpstreamModel(
      parsed.deploymentId,
      parsed.loraName
    );

    const response = await fetch(`${fqdn.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, model, stream: true }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Deployment error: ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const chunk = JSON.parse(data);
          yield {
            id: chunk.id || generateId(),
            object: "chat.completion.chunk",
            created: chunk.created || Math.floor(Date.now() / 1000),
            model: request.model,
            choices: chunk.choices || [],
          };
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async listModelsForOrg(organizationId: string): Promise<ModelInfo[]> {
    const orgDeployments = await db.query.deployments.findMany({
      where: and(
        eq(deployments.organizationId, organizationId),
        eq(deployments.status, "running")
      ),
    });

    const models: ModelInfo[] = orgDeployments.map((d) => ({
      id: `custom:${d.id}`,
      object: "model" as const,
      created: Math.floor(new Date(d.createdAt).getTime() / 1000),
      owned_by: "custom",
      provider: this.slug,
      display_name: d.name,
    }));

    for (const d of orgDeployments) {
      const loras = await db.query.deploymentLoras.findMany({
        where: and(
          eq(deploymentLoras.deploymentId, d.id),
          eq(deploymentLoras.status, "loaded")
        ),
      });
      for (const l of loras) {
        models.push({
          id: `custom:${d.id}/${l.name}`,
          object: "model" as const,
          created: Math.floor(new Date(l.createdAt).getTime() / 1000),
          owned_by: "custom",
          provider: this.slug,
          display_name: `${d.name} · ${l.name}`,
        });
      }
    }

    const routers = await db.query.deploymentRouters.findMany({
      where: and(
        eq(deploymentRouters.organizationId, organizationId),
        eq(deploymentRouters.status, "active")
      ),
    });
    for (const r of routers) {
      models.push({
        id: `router:${r.slug}`,
        object: "model" as const,
        created: Math.floor(new Date(r.createdAt).getTime() / 1000),
        owned_by: "custom",
        provider: this.slug,
        display_name: `Router · ${r.name}`,
      });
    }

    return models;
  }
}
