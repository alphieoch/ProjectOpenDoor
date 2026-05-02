import MistralClient from "@mistralai/mistralai";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";

export class MistralProvider implements ProviderAdapter {
  name = "Mistral AI";
  slug = "mistral";
  private client: any;

  constructor() {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error("MISTRAL_API_KEY not set");
    this.client = new MistralClient(apiKey);
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const response = await this.client.chat({
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature,
      maxTokens: request.max_tokens,
      topP: request.top_p,
    });

    return {
      id: response.id || generateId(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: response.choices.map((c: any, index: number) => ({
        index,
        message: {
          role: c.message.role,
          content: c.message.content,
        },
        finish_reason: c.finishReason || "stop",
      })),
      usage: {
        prompt_tokens: response.usage?.promptTokens || 0,
        completion_tokens: response.usage?.completionTokens || 0,
        total_tokens: response.usage?.totalTokens || 0,
      },
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const stream = await this.client.chatStream({
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature,
      maxTokens: request.max_tokens,
      topP: request.top_p,
    });

    const id = generateId();
    let first = true;

    for await (const chunk of stream) {
      const choice = chunk.data?.choices?.[0];
      if (choice) {
        yield {
          id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [
            {
              index: 0,
              delta: {
                role: first ? "assistant" : undefined,
                content: choice.delta?.content,
              },
              finish_reason: choice.finishReason || null,
            },
          ],
        };
        first = false;
      }
    }

    yield {
      id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "mistral-large-latest",
        object: "model",
        created: 0,
        owned_by: "mistralai",
        provider: this.slug,
        display_name: "Mistral Large",
      },
      {
        id: "mistral-medium-latest",
        object: "model",
        created: 0,
        owned_by: "mistralai",
        provider: this.slug,
        display_name: "Mistral Medium",
      },
      {
        id: "mistral-small-latest",
        object: "model",
        created: 0,
        owned_by: "mistralai",
        provider: this.slug,
        display_name: "Mistral Small",
      },
      {
        id: "codestral-latest",
        object: "model",
        created: 0,
        owned_by: "mistralai",
        provider: this.slug,
        display_name: "Codestral",
      },
    ];
  }
}
