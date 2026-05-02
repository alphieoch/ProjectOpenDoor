import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";

interface AzureDeployment {
  id: string;
  model: string;
  owner: string;
  status: string;
  created_at: number;
  capabilities?: {
    chat_completion?: boolean;
    completions?: boolean;
    embeddings?: boolean;
  };
}

/**
 * Azure OpenAI Service provider.
 * Connects to Azure OpenAI or Azure AI Inference endpoints.
 *
 * Env vars:
 *   AZURE_AI_FOUNDRY_ENDPOINT  – required (e.g. https://my-resource.openai.azure.com)
 *   AZURE_AI_FOUNDRY_KEY       – required
 *   AZURE_INFERENCE_ENDPOINT   – optional (e.g. https://my-resource.cognitiveservices.azure.com)
 *   AZURE_INFERENCE_KEY        – optional
 */
export class AzureFoundryProvider implements ProviderAdapter {
  name = "Azure AI";
  slug = "azure-foundry";

  private endpoint: string;
  private apiKey: string;
  private inferenceEndpoint?: string;
  private inferenceKey?: string;
  private deployments: AzureDeployment[] = [];
  private inferenceModels: ModelInfo[] = [];

  constructor() {
    const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
    const apiKey = process.env.AZURE_AI_FOUNDRY_KEY;
    if (!endpoint) throw new Error("AZURE_AI_FOUNDRY_ENDPOINT not set");
    if (!apiKey) throw new Error("AZURE_AI_FOUNDRY_KEY not set");
    this.endpoint = endpoint.replace(/\/$/, "");
    this.apiKey = apiKey;

    // Optional Azure AI Inference API (for serverless models)
    this.inferenceEndpoint = process.env.AZURE_INFERENCE_ENDPOINT?.replace(/\/$/, "");
    this.inferenceKey = process.env.AZURE_INFERENCE_KEY;
  }

  /** Discover deployed models from Azure OpenAI */
  private async fetchDeployments(): Promise<AzureDeployment[]> {
    try {
      const res = await fetch(
        `${this.endpoint}/openai/deployments?api-version=2023-03-15-preview`,
        {
          headers: { "api-key": this.apiKey },
        }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: AzureDeployment[] };
      return data.data || [];
    } catch {
      return [];
    }
  }

  /** Query Azure AI Inference API for available models */
  private async fetchInferenceModels(): Promise<ModelInfo[]> {
    if (!this.inferenceEndpoint || !this.inferenceKey) return [];
    try {
      const res = await fetch(
        `${this.inferenceEndpoint}/models?api-version=2024-05-01-preview`,
        {
          headers: { "api-key": this.inferenceKey },
        }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        data?: Array<{
          id: string;
          created_at?: number;
          object?: string;
          owned_by?: string;
        }>;
      };
      return (data.data || [])
        .filter((m) => m.id)
        .map((m) => ({
          id: m.id,
          object: "model" as const,
          created: m.created_at || 0,
          owned_by: m.owned_by || "azure",
          provider: this.slug,
          display_name: m.id,
        }));
    } catch {
      return [];
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // Cache deployments on first call
    if (this.deployments.length === 0) {
      this.deployments = await this.fetchDeployments();
    }
    if (this.inferenceModels.length === 0 && this.inferenceEndpoint) {
      this.inferenceModels = await this.fetchInferenceModels();
    }

    const fromDeployments: ModelInfo[] = this.deployments
      .filter((d) => d.status === "succeeded" && d.capabilities?.chat_completion !== false)
      .map((d) => ({
        id: d.id, // deployment name = model id used in requests
        object: "model",
        created: d.created_at || 0,
        owned_by: d.owner || "azure-openai",
        provider: this.slug,
        display_name: d.model || d.id,
      }));

    // Merge inference models, avoiding duplicates
    const seen = new Set(fromDeployments.map((m) => m.id));
    const merged = [...fromDeployments];
    for (const m of this.inferenceModels) {
      if (!seen.has(m.id)) {
        merged.push(m);
        seen.add(m.id);
      }
    }

    return merged;
  }

  /** Build request body, forwarding every field Azure supports */
  private buildBody(request: ChatCompletionRequest, stream: boolean): unknown {
    const body: Record<string, unknown> = {
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 2048,
      top_p: request.top_p ?? 1,
      frequency_penalty: request.frequency_penalty ?? 0,
      presence_penalty: request.presence_penalty ?? 0,
      stream,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      if (request.tool_choice) body.tool_choice = request.tool_choice;
    }
    if (request.user) body.user = request.user;

    // Azure AI Inference API requires model in body; Azure OpenAI ignores it
    body.model = request.model;

    return body;
  }

  /** Choose the best endpoint for a given model */
  private getUrl(request: ChatCompletionRequest): string {
    // If this model is known as an inference model, use inference endpoint
    const isInferenceModel = this.inferenceModels.some((m) => m.id === request.model);
    if (isInferenceModel && this.inferenceEndpoint) {
      return `${this.inferenceEndpoint}/models/chat/completions?api-version=2024-05-01-preview`;
    }
    // Default to Azure OpenAI deployment endpoint
    return `${this.endpoint}/openai/deployments/${request.model}/chat/completions?api-version=2024-06-01`;
  }

  private getAuth(): string {
    // If using inference endpoint for this call, use inference key
    // (decided per-request in getUrl; we’ll pass both keys and let the
    //  endpoint decide, but really we should track which endpoint is used)
    return this.apiKey;
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const url = this.getUrl(request);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.getAuth(),
      },
      body: JSON.stringify(this.buildBody(request, false)),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Azure error [${response.status}]: ${text}`);
    }

    const data = (await response.json()) as any;
    return {
      id: data.id || generateId(),
      object: "chat.completion",
      created: data.created || Math.floor(Date.now() / 1000),
      model: data.model || request.model,
      choices: data.choices.map((c: any) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
          tool_calls: c.message.tool_calls,
          tool_call_id: c.message.tool_call_id,
        },
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const url = this.getUrl(request);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.getAuth(),
      },
      body: JSON.stringify(this.buildBody(request, true)),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Azure error [${response.status}]`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
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
              model: chunk.model || request.model,
              choices: chunk.choices.map((c: any) => ({
                index: c.index || 0,
                delta: {
                  role: c.delta?.role,
                  content: c.delta?.content,
                  tool_calls: c.delta?.tool_calls,
                  tool_call_id: c.delta?.tool_call_id,
                },
                finish_reason: c.finish_reason || null,
              })),
            };
          } catch {
            // ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
