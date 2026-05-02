import { CohereClient } from "cohere-ai";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";

export class CohereProvider implements ProviderAdapter {
  name = "Cohere";
  slug = "cohere";
  private client: CohereClient;

  constructor() {
    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) throw new Error("COHERE_API_KEY not set");
    this.client = new CohereClient({ token: apiKey });
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const messages = request.messages.map((m) => ({
      role: m.role === "assistant" ? "CHATBOT" : "USER",
      message: m.content,
    }));

    const response = await this.client.chat({
      model: request.model,
      message: messages[messages.length - 1].message,
      chatHistory: messages.slice(0, -1).map((m) => ({
        role: m.role as any,
        message: m.message,
      })),
      temperature: request.temperature,
      maxTokens: request.max_tokens,
      p: request.top_p,
    });

    return {
      id: generateId(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: response.text,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const messages = request.messages.map((m) => ({
      role: m.role === "assistant" ? "CHATBOT" : "USER",
      message: m.content,
    }));

    const stream = await this.client.chatStream({
      model: request.model,
      message: messages[messages.length - 1].message,
      chatHistory: messages.slice(0, -1).map((m) => ({
        role: m.role as any,
        message: m.message,
      })),
      temperature: request.temperature,
      maxTokens: request.max_tokens,
      p: request.top_p,
    });

    const id = generateId();
    let first = true;

    for await (const event of stream) {
      if (event.eventType === "text-generation") {
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
                content: event.text,
              },
              finish_reason: null,
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
        id: "command-r-plus",
        object: "model",
        created: 0,
        owned_by: "cohere",
        provider: this.slug,
        display_name: "Command R+",
      },
      {
        id: "command-r",
        object: "model",
        created: 0,
        owned_by: "cohere",
        provider: this.slug,
        display_name: "Command R",
      },
      {
        id: "command",
        object: "model",
        created: 0,
        owned_by: "cohere",
        provider: this.slug,
        display_name: "Command",
      },
    ];
  }
}
