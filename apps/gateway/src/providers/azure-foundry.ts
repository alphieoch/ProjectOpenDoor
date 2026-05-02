import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";

export class AzureFoundryProvider implements ProviderAdapter {
  name = "Azure AI Foundry";
  slug = "azure-foundry";
  private endpoint: string;
  private apiKey: string;

  constructor() {
    const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
    const apiKey = process.env.AZURE_AI_FOUNDRY_KEY;
    if (!endpoint) throw new Error("AZURE_AI_FOUNDRY_ENDPOINT not set");
    if (!apiKey) throw new Error("AZURE_AI_FOUNDRY_KEY not set");
    this.endpoint = endpoint.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const url = `${this.endpoint}/openai/deployments/${request.model}/chat/completions?api-version=2024-06-01`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify({
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Azure Foundry error: ${response.status} ${await response.text()}`
      );
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
    const url = `${this.endpoint}/openai/deployments/${request.model}/chat/completions?api-version=2024-06-01`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify({
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Azure Foundry error: ${response.status}`);
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

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "gpt-4o",
        object: "model",
        created: 0,
        owned_by: "openai",
        provider: this.slug,
        display_name: "GPT-4o",
      },
      {
        id: "gpt-4o-mini",
        object: "model",
        created: 0,
        owned_by: "openai",
        provider: this.slug,
        display_name: "GPT-4o Mini",
      },
      {
        id: "gpt-4",
        object: "model",
        created: 0,
        owned_by: "openai",
        provider: this.slug,
        display_name: "GPT-4",
      },
      {
        id: "gpt-35-turbo",
        object: "model",
        created: 0,
        owned_by: "openai",
        provider: this.slug,
        display_name: "GPT-3.5 Turbo",
      },
    ];
  }
}
