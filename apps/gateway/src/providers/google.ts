import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import { toGeminiParts } from "./content.js";

export class GoogleProvider implements ProviderAdapter {
  name = "Google";
  slug = "google";
  private client: GoogleGenerativeAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GOOGLE_API_KEY not set");
    this.client = new GoogleGenerativeAI(key);
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const model = this.client.getGenerativeModel({ model: request.model });
    const history = request.messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGeminiParts(m.content),
    }));

    const lastMessage = request.messages[request.messages.length - 1];
    const result = await model.generateContent({
      contents: [
        ...history,
        { role: "user", parts: toGeminiParts(lastMessage.content) },
      ],
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
        topP: request.top_p,
      },
    });

    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

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
            content: text,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: usage?.promptTokenCount || 0,
        completion_tokens: usage?.candidatesTokenCount || 0,
        total_tokens: usage?.totalTokenCount || 0,
      },
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const model = this.client.getGenerativeModel({ model: request.model });
    const history = request.messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGeminiParts(m.content),
    }));
    const lastMessage = request.messages[request.messages.length - 1];

    const result = await model.generateContentStream({
      contents: [
        ...history,
        { role: "user", parts: toGeminiParts(lastMessage.content) },
      ],
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
        topP: request.top_p,
      },
    });

    const id = generateId();
    let first = true;

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
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
                content: text,
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
        id: "gemini-1.5-pro",
        object: "model",
        created: 0,
        owned_by: "google",
        provider: this.slug,
        display_name: "Gemini 1.5 Pro",
      },
      {
        id: "gemini-1.5-flash",
        object: "model",
        created: 0,
        owned_by: "google",
        provider: this.slug,
        display_name: "Gemini 1.5 Flash",
      },
    ];
  }
}
