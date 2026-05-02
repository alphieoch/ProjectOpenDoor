// @ts-nocheck
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import { db, deployments } from "@opendoor/database";
import { eq, and } from "drizzle-orm";

export class CustomDeploymentProvider implements ProviderAdapter {
  name = "Custom Deployment";
  slug = "custom";

  private async getDeployment(deploymentId: string) {
    const deployment = await db.query.deployments.findFirst({
      where: and(eq(deployments.id, deploymentId), eq(deployments.status, "running")),
    });
    return deployment;
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const deploymentId = request.model.replace("custom:", "");
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found or not running: ${deploymentId}`);
    }

    const response = await fetch(`${deployment.fqdn}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, model: "default" }),
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
    const deploymentId = request.model.replace("custom:", "");
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found or not running: ${deploymentId}`);
    }

    const response = await fetch(`${deployment.fqdn}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, model: "default", stream: true }),
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
    // Custom deployments are org-specific and resolved dynamically
    // This method is called for the global /v1/models endpoint
    return [];
  }

  // List models for a specific organization
  async listModelsForOrg(organizationId: string): Promise<ModelInfo[]> {
    const orgDeployments = await db.query.deployments.findMany({
      where: and(
        eq(deployments.organizationId, organizationId),
        eq(deployments.status, "running")
      ),
    });

    return orgDeployments.map((d) => ({
      id: `custom:${d.id}`,
      object: "model" as const,
      created: Math.floor(new Date(d.createdAt).getTime() / 1000),
      owned_by: "custom",
      provider: this.slug,
      displayName: d.name,
    }));
  }
}
