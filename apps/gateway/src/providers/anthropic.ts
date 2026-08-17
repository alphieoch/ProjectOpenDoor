import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import { toAnthropicContent } from "./content.js";

export class AnthropicProvider implements ProviderAdapter {
  name = "Anthropic";
  slug = "anthropic";
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    this.client = new Anthropic({ apiKey: key });
  }

  private toAnthropicMessages(messages: ChatCompletionRequest["messages"]) {
    return messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: toAnthropicContent(m.content) as Anthropic.MessageParam["content"],
    })) as Anthropic.MessageParam[];
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages: this.toAnthropicMessages(request.messages),
      temperature: request.temperature,
      top_p: request.top_p,
      stream: false,
    });

    const content =
      response.content.find((c) => c.type === "text")?.text || "";

    return {
      id: response.id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason:
            response.stop_reason === "max_tokens" ? "length" : "stop",
        },
      ],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens:
          response.usage.input_tokens + response.usage.output_tokens,
        cached_tokens: Number((response.usage as any).cache_read_input_tokens || 0),
      },
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const stream = await this.client.messages.create({
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages: this.toAnthropicMessages(request.messages),
      temperature: request.temperature,
      top_p: request.top_p,
      stream: true,
    });

    const id = generateId();
    let first = true;

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
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
                content:
                  event.delta.type === "text_delta"
                    ? event.delta.text
                    : undefined,
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
        id: "claude-3-5-sonnet-20241022",
        object: "model",
        created: 0,
        owned_by: "anthropic",
        provider: this.slug,
        display_name: "Claude 3.5 Sonnet",
      },
      {
        id: "claude-3-opus-20240229",
        object: "model",
        created: 0,
        owned_by: "anthropic",
        provider: this.slug,
        display_name: "Claude 3 Opus",
      },
      {
        id: "claude-3-haiku-20240307",
        object: "model",
        created: 0,
        owned_by: "anthropic",
        provider: this.slug,
        display_name: "Claude 3 Haiku",
      },
    ];
  }
}
