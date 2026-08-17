import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelInfo,
} from "@opendoor/shared";
import { isProductionRuntime } from "@opendoor/shared";
import type { ProviderAdapter } from "./base.js";
import { generateId } from "./base.js";
import { openaiChatPayload } from "./openai-body.js";
import { toGeminiParts } from "./content.js";
import { normalizeUsage } from "../utils/usage.js";
import { getGcpAccessToken } from "../lib/web-search.js";

type VertexProtocol = "openai" | "generateContent";

export type VertexRoute = {
  upstream: string;
  location: string;
  protocol: VertexProtocol;
  publisher?: string;
  listed?: boolean;
};

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function vertexProjectId(): string {
  return env("GOOGLE_CLOUD_PROJECT") || env("GCP_PROJECT") || env("GCP_PROJECT_ID");
}

export function vertexPlatformConfigured(): boolean {
  return Boolean(
    vertexProjectId() ||
      env("VERTEX_API_KEY") ||
      env("GOOGLE_APPLICATION_CREDENTIALS")
  );
}

/**
 * Vertex Model Garden / Gemini MaaS — no dedicated GPU.
 * OpenAI chat completions for partner/open MaaS; generateContent for Gemini.
 * Only `listed: true` ids returned HTTP 200 on project-800192c2-3ecc-4889-8f7.
 * Llama MaaS is mapped but unlisted — chat still 404s after EULA accept;
 * enable the Model Garden card (requestAccess) in the console.
 */
export class VertexProvider implements ProviderAdapter {
  name = "Vertex AI (Model Garden)";
  slug = "vertex";
  private apiKey: string;

  static readonly MODEL_MAP: Record<string, VertexRoute> = {
    "gemma-4-26b-a4b-it": {
      upstream: "google/gemma-4-26b-a4b-it-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "qwen3-next-80b-instruct": {
      upstream: "qwen/qwen3-next-80b-a3b-instruct-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "qwen3-next-80b-thinking": {
      upstream: "qwen/qwen3-next-80b-a3b-thinking-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "qwen3-coder-480b-a35b-instruct": {
      upstream: "qwen/qwen3-coder-480b-a35b-instruct-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "deepseek-v3.2": {
      upstream: "deepseek-ai/deepseek-v3.2-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "deepseek-r1": {
      upstream: "deepseek-ai/deepseek-r1-0528-maas",
      location: "us-central1",
      protocol: "openai",
      listed: true,
    },
    "kimi-k2-thinking": {
      upstream: "moonshotai/kimi-k2-thinking-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "minimax-m2": {
      upstream: "minimaxai/minimax-m2-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "glm-4.7": {
      upstream: "zai-org/glm-4.7-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "glm-5": {
      upstream: "zai-org/glm-5-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "gpt-oss-120b": {
      upstream: "openai/gpt-oss-120b-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "gpt-oss-20b": {
      upstream: "openai/gpt-oss-20b-maas",
      location: "global",
      protocol: "openai",
      listed: true,
    },
    "gemini-2.5-flash": {
      upstream: "gemini-2.5-flash",
      location: "global",
      protocol: "generateContent",
      publisher: "google",
      listed: true,
    },
    "gemini-2.5-pro": {
      upstream: "gemini-2.5-pro",
      location: "global",
      protocol: "generateContent",
      publisher: "google",
      listed: true,
    },
    // Chat 404 until Model Garden Enable (not just EULA). Do not list.
    "llama-3.3-70b-instruct": {
      upstream: "meta/llama-3.3-70b-instruct-maas",
      location: "us-central1",
      protocol: "openai",
    },
    "llama-4-scout-17b-16e-instruct": {
      upstream: "meta/llama-4-scout-17b-16e-instruct-maas",
      location: "us-east5",
      protocol: "openai",
    },
    "llama-4-maverick-17b-128e-instruct": {
      upstream: "meta/llama-4-maverick-17b-128e-instruct-maas",
      location: "us-east5",
      protocol: "openai",
    },
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? env("VERTEX_API_KEY");
  }

  private configured(): boolean {
    return Boolean(this.apiKey || vertexPlatformConfigured());
  }

  private requireProject(): string {
    const project = vertexProjectId();
    if (!project) {
      throw new Error(
        "Vertex wholesale path is not configured. Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials, or VERTEX_API_KEY."
      );
    }
    return project;
  }

  private route(modelId: string): VertexRoute {
    return (
      VertexProvider.MODEL_MAP[modelId] || {
        upstream: modelId,
        location: env("VERTEX_LOCATION") || env("GOOGLE_CLOUD_LOCATION") || "global",
        protocol: modelId.startsWith("gemini-") ? "generateContent" : "openai",
        publisher: "google",
      }
    );
  }

  private host(location: string): string {
    return location === "global"
      ? "https://aiplatform.googleapis.com"
      : `https://${location}-aiplatform.googleapis.com`;
  }

  private async authHeaders(url: URL): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) {
      url.searchParams.set("key", this.apiKey);
      return headers;
    }
    const token = await getGcpAccessToken();
    if (!token) {
      throw new Error(
        "Vertex wholesale path is not configured. Set GOOGLE_CLOUD_PROJECT / GCP_PROJECT / GCP_PROJECT_ID and Application Default Credentials (`gcloud auth application-default login`), or VERTEX_API_KEY."
      );
    }
    headers.Authorization = `Bearer ${token}`;
    const project = vertexProjectId();
    if (project) headers["x-goog-user-project"] = project;
    return headers;
  }

  private openaiUrl(location: string): URL {
    const project = this.requireProject();
    return new URL(
      `${this.host(location)}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/endpoints/openapi/chat/completions`
    );
  }

  private generateContentUrl(route: VertexRoute, stream: boolean): URL {
    const project = this.requireProject();
    const publisher = route.publisher || "google";
    const method = stream ? "streamGenerateContent" : "generateContent";
    const url = new URL(
      `${this.host(route.location)}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(route.location)}/publishers/${encodeURIComponent(publisher)}/models/${encodeURIComponent(route.upstream)}:${method}`
    );
    if (stream) url.searchParams.set("alt", "sse");
    return url;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const route = this.route(request.model);
    if (route.protocol === "generateContent") {
      return this.generateContent(request, route);
    }
    return this.openaiCompletion(request, route, false) as Promise<ChatCompletionResponse>;
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const route = this.route(request.model);
    if (route.protocol === "generateContent") {
      yield* this.generateContentStream(request, route);
      return;
    }
    const stream = (await this.openaiCompletion(request, route, true)) as AsyncGenerator<
      ChatCompletionChunk,
      void,
      unknown
    >;
    yield* stream;
  }

  private async openaiCompletion(
    request: ChatCompletionRequest,
    route: VertexRoute,
    stream: false
  ): Promise<ChatCompletionResponse>;
  private async openaiCompletion(
    request: ChatCompletionRequest,
    route: VertexRoute,
    stream: true
  ): Promise<AsyncGenerator<ChatCompletionChunk, void, unknown>>;
  private async openaiCompletion(
    request: ChatCompletionRequest,
    route: VertexRoute,
    stream: boolean
  ): Promise<ChatCompletionResponse | AsyncGenerator<ChatCompletionChunk, void, unknown>> {
    const url = this.openaiUrl(route.location);
    const headers = await this.authHeaders(url);
    let response: Response | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(
          openaiChatPayload({ ...request, model: route.upstream }, stream, route.upstream)
        ),
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) break;
      lastError = await response.text().catch(() => "");
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Vertex API error: ${response.status} ${lastError}`);
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    if (!response?.ok) {
      throw new Error(`Vertex API error: ${response?.status || 502} ${lastError}`);
    }

    if (stream) {
      return this.readOpenAiStream(response, request.model);
    }

    const data = (await response.json()) as any;
    return {
      id: data.id || generateId(),
      object: "chat.completion",
      created: data.created || Math.floor(Date.now() / 1000),
      model: request.model,
      choices: (data.choices || []).map((c: any) => ({
        index: c.index,
        message: {
          role: c.message?.role || "assistant",
          content: c.message?.content || "",
          tool_calls: c.message?.tool_calls,
          ...(c.message?.reasoning_content
            ? { reasoning_content: c.message.reasoning_content }
            : {}),
        },
        finish_reason: c.finish_reason,
      })),
      usage: normalizeUsage(data.usage),
    };
  }

  private async *readOpenAiStream(
    response: Response,
    model: string
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    if (!response.body) throw new Error("Vertex API error: empty stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const parseLine = (line: string): ChatCompletionChunk | "done" | null => {
      const trimmed = line.trim();
      if (!trimmed.toLowerCase().startsWith("data:")) return null;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") return "done";
      const chunk = JSON.parse(payload);
      if (chunk.error) {
        const msg =
          typeof chunk.error === "string"
            ? chunk.error
            : chunk.error.message || JSON.stringify(chunk.error);
        throw new Error(`Vertex API error: ${msg}`);
      }
      return {
        id: chunk.id || generateId(),
        object: "chat.completion.chunk",
        created: chunk.created || Math.floor(Date.now() / 1000),
        model,
        choices: (chunk.choices || []).map((c: any) => ({
          index: c.index || 0,
          delta: {
            role: c.delta?.role,
            content:
              typeof c.delta?.content === "string" && c.delta.content
                ? c.delta.content
                : typeof c.message?.content === "string" && c.message.content
                  ? c.message.content
                  : undefined,
            tool_calls: c.delta?.tool_calls,
            ...(c.delta?.reasoning_content
              ? { reasoning_content: c.delta.reasoning_content }
              : {}),
          },
          finish_reason: c.finish_reason || null,
        })),
      };
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          try {
            const parsed = parseLine(line);
            if (parsed === "done") return;
            if (parsed) yield parsed;
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
      }
      if (buffer.trim()) {
        const parsed = parseLine(buffer);
        if (parsed && parsed !== "done") yield parsed;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private geminiBody(request: ChatCompletionRequest, route: VertexRoute) {
    const history = request.messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGeminiParts(m.content),
    }));
    const lastMessage = request.messages[request.messages.length - 1];
    const generationConfig: Record<string, unknown> = {};
    // gemini-2.5-pro rejects thinking_budget=0 (live probe 400).
    if (!/pro/i.test(route.upstream)) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    if (request.temperature != null) generationConfig.temperature = request.temperature;
    if (request.max_tokens != null) generationConfig.maxOutputTokens = request.max_tokens;
    if (request.top_p != null) generationConfig.topP = request.top_p;
    return {
      contents: [...history, { role: "user", parts: toGeminiParts(lastMessage.content) }],
      generationConfig,
    };
  }

  private async generateContent(
    request: ChatCompletionRequest,
    route: VertexRoute
  ): Promise<ChatCompletionResponse> {
    const url = this.generateContentUrl(route, false);
    const headers = await this.authHeaders(url);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(this.geminiBody(request, route)),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      throw new Error(`Vertex API error: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as any;
    const text =
      data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    const usage = data.usageMetadata;
    return {
      id: generateId(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
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

  private async *generateContentStream(
    request: ChatCompletionRequest,
    route: VertexRoute
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const url = this.generateContentUrl(route, true);
    const headers = await this.authHeaders(url);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(this.geminiBody(request, route)),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Vertex API error: ${response.status} ${await response.text()}`);
    }
    const id = generateId();
    const created = Math.floor(Date.now() / 1000);
    let first = true;
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
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const chunk = JSON.parse(payload);
            const text =
              chunk.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") ||
              "";
            if (!text) continue;
            yield {
              id,
              object: "chat.completion.chunk",
              created,
              model: request.model,
              choices: [
                {
                  index: 0,
                  delta: { role: first ? "assistant" : undefined, content: text },
                  finish_reason: null,
                },
              ],
            };
            first = false;
          } catch {
            /* ignore parse errors */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield {
      id,
      object: "chat.completion.chunk",
      created,
      model: request.model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.configured() && isProductionRuntime()) return [];
    return Object.entries(VertexProvider.MODEL_MAP)
      .filter(([, route]) => route.listed)
      .map(([id, route]) => ({
        id,
        object: "model" as const,
        created: Math.floor(Date.now() / 1000),
        owned_by: route.publisher || route.upstream.split("/")[0] || "google",
        provider: this.slug,
        display_name: id,
      }));
  }
}
