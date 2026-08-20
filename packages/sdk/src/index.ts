export type ProviderSort = "price" | "latency" | "throughput";

/** OpenRouter-shaped provider routing preferences. */
export interface ProviderPreferences {
  order?: string[];
  allow_fallbacks?: boolean;
  sort?: ProviderSort;
  only?: string[];
  ignore?: string[];
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string | Array<Record<string, unknown>>;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface ChatCompletionCreateParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
  user?: string;
  service_tier?: "standard" | "priority";
  prompt_cache_key?: string;
  provider?: ProviderPreferences;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: UsageInfo;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: string | null;
  }>;
}

export interface ModelInfo {
  id: string;
  object?: "model";
  created?: number;
  owned_by?: string;
  provider?: string;
}

export interface ModelList {
  object?: "list";
  data: ModelInfo[];
}

export interface ImageGenerateParams {
  prompt: string;
  model: string;
  n?: number;
  size?: string;
  aspect_ratio?: string;
  response_format?: "url" | "b64_json";
  image?: string | { b64_json?: string; url?: string };
  mask?: string | { b64_json?: string; url?: string };
}

export interface ImageGenerateResponse {
  created?: number;
  data: Array<{ url?: string; b64_json?: string }>;
}

export interface VideoGenerateParams {
  prompt: string;
  model?: string;
  n?: number;
  duration?: number;
  size?: string;
  aspect_ratio?: string;
  image?: string | { b64_json?: string; url?: string };
}

export interface VideoGeneration {
  id: string;
  object?: "video.generation";
  created?: number;
  model?: string;
  status: string;
  url?: string;
  mime_type?: string;
  error?: string;
}

export interface AudioTranscribeParams {
  file: Blob | File;
  model: string;
  language?: string;
  filename?: string;
}

export interface Transcription {
  text: string;
}

export interface BatchJob {
  id: string;
  object?: "batch";
  status?: string;
  [key: string]: unknown;
}

export interface OpenDoorOptions {
  apiKey?: string;
  /** Gateway origin, no trailing slash. Defaults to `OPENDOOR_BASE_URL` or `http://localhost:3001`. */
  baseURL?: string;
}

export class OpenDoorError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "OpenDoorError";
    this.status = status;
    this.body = body;
  }
}

function readEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function* iterateSse(res: Response): AsyncGenerator<ChatCompletionChunk> {
  const reader = res.body?.getReader();
  if (!reader) return;
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
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") {
        if (data === "[DONE]") return;
        continue;
      }
      try {
        yield JSON.parse(data) as ChatCompletionChunk;
      } catch {
        /* skip malformed SSE lines */
      }
    }
  }
}

type ChatCreate = {
  (params: ChatCompletionCreateParams & { stream: true }): Promise<AsyncIterable<ChatCompletionChunk>>;
  (params: ChatCompletionCreateParams & { stream?: false }): Promise<ChatCompletion>;
  (params: ChatCompletionCreateParams): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>>;
};

export class OpenDoor {
  readonly apiKey: string;
  readonly baseURL: string;

  readonly chat: {
    completions: {
      create: ChatCreate;
    };
  };

  readonly models: {
    list(): Promise<ModelList>;
  };

  readonly generations: {
    get(id: string): Promise<unknown>;
  };

  readonly images: {
    generate(params: ImageGenerateParams): Promise<ImageGenerateResponse>;
  };

  readonly videos: {
    generate(params: VideoGenerateParams): Promise<VideoGeneration>;
    get(id: string): Promise<VideoGeneration>;
  };

  readonly audio: {
    transcribe(params: AudioTranscribeParams): Promise<Transcription>;
    speech(params: { input: string; model?: string; voice?: string }): Promise<ArrayBuffer>;
  };

  readonly batches: {
    create(body: Record<string, unknown>): Promise<BatchJob>;
    get(id: string): Promise<BatchJob>;
    list(): Promise<unknown>;
  };

  readonly embeddings: {
    create(body: Record<string, unknown>): Promise<unknown>;
  };

  readonly rerank: {
    create(body: Record<string, unknown>): Promise<unknown>;
  };

  readonly responses: {
    create(body: Record<string, unknown>): Promise<unknown>;
  };

  readonly files: {
    list(purpose?: string): Promise<unknown>;
    get(id: string): Promise<unknown>;
    content(id: string): Promise<unknown>;
    delete(id: string): Promise<unknown>;
  };

  readonly plugins: {
    webSearch(body: { query: string; max_results?: number }): Promise<unknown>;
  };

  readonly catalog: {
    list(): Promise<unknown>;
  };

  readonly account: {
    get(): Promise<unknown>;
    balance(): Promise<unknown>;
  };

  readonly usage: {
    get(params?: { days?: number }): Promise<unknown>;
    rateLimits(): Promise<unknown>;
  };

  readonly requests: {
    list(params?: { limit?: number; status?: string; q?: string }): Promise<unknown>;
    get(id: string): Promise<unknown>;
  };

  readonly keys: {
    list(): Promise<unknown>;
    create(body?: Record<string, unknown>): Promise<unknown>;
    delete(id: string): Promise<unknown>;
  };

  readonly assistants: {
    list(): Promise<unknown>;
    create(body: Record<string, unknown>): Promise<unknown>;
    get(id: string): Promise<unknown>;
    update(id: string, body: Record<string, unknown>): Promise<unknown>;
    delete(id: string): Promise<unknown>;
    chat(id: string, body: Record<string, unknown>): Promise<ChatCompletion>;
  };

  readonly workflows: {
    list(): Promise<unknown>;
    create(body: Record<string, unknown>): Promise<unknown>;
    get(id: string): Promise<unknown>;
    update(id: string, body: Record<string, unknown>): Promise<unknown>;
    delete(id: string): Promise<unknown>;
    run(id: string, input?: Record<string, unknown>): Promise<unknown>;
    runs(id: string): Promise<unknown>;
    publish(id: string, body?: Record<string, unknown>): Promise<unknown>;
    versions(id: string): Promise<unknown>;
    trigger(id: string, body?: Record<string, unknown>): Promise<unknown>;
  };

  readonly training: {
    datasets: {
      list(): Promise<unknown>;
      create(body: Record<string, unknown>): Promise<unknown>;
      get(id: string): Promise<unknown>;
    };
    jobs: {
      list(): Promise<unknown>;
      create(body: Record<string, unknown>): Promise<unknown>;
      get(id: string): Promise<unknown>;
    };
  };

  readonly deployments: {
    list(): Promise<unknown>;
    create(body: Record<string, unknown>): Promise<unknown>;
    get(id: string): Promise<unknown>;
    delete(id: string): Promise<unknown>;
  };

  readonly agents: {
    list(): Promise<unknown>;
    create(body: Record<string, unknown>): Promise<unknown>;
    get(id: string): Promise<unknown>;
    update(id: string, body: Record<string, unknown>): Promise<unknown>;
    chat(id: string, body: { message: string }): Promise<unknown>;
    agui(id: string, body: Record<string, unknown>): Promise<Response>;
    start(id: string): Promise<unknown>;
    stop(id: string): Promise<unknown>;
    computer(id: string, control: "take" | "release"): Promise<unknown>;
    delete(id: string): Promise<unknown>;
  };

  readonly byok: {
    list(): Promise<unknown>;
    create(body: Record<string, unknown>): Promise<unknown>;
    delete(id: string): Promise<unknown>;
  };

  readonly policies: {
    list(): Promise<unknown>;
    create(body: Record<string, unknown>): Promise<unknown>;
    get(id: string): Promise<unknown>;
    update(id: string, body: Record<string, unknown>): Promise<unknown>;
    delete(id: string): Promise<unknown>;
  };

  readonly premium: {
    rentals: {
      list(): Promise<unknown>;
      create(body?: Record<string, unknown>): Promise<unknown>;
      get(id: string): Promise<unknown>;
      delete(id: string): Promise<unknown>;
    };
  };

  constructor(opts: OpenDoorOptions = {}) {
    const apiKey = opts.apiKey ?? readEnv("OPENDOOR_API_KEY") ?? "";
    if (!apiKey) {
      throw new OpenDoorError("Set OPENDOOR_API_KEY or pass apiKey", 401, null);
    }
    this.apiKey = apiKey;
    this.baseURL = (opts.baseURL ?? readEnv("OPENDOOR_BASE_URL") ?? "http://localhost:3001").replace(
      /\/$/,
      "",
    );

    this.chat = {
      completions: {
        create: ((params: ChatCompletionCreateParams) => this.createChat(params)) as ChatCreate,
      },
    };
    this.models = {
      list: () => this.request<ModelList>("GET", "/v1/models"),
    };
    this.generations = {
      get: (id: string) => this.request("GET", `/v1/generation/${encodeURIComponent(id)}`),
    };
    this.images = {
      generate: (params: ImageGenerateParams) =>
        this.request<ImageGenerateResponse>("POST", "/v1/images/generations", params),
    };
    this.videos = {
      generate: (params: VideoGenerateParams) =>
        this.request<VideoGeneration>("POST", "/v1/videos/generations", params),
      get: (id: string) =>
        this.request<VideoGeneration>("GET", `/v1/videos/generations/${encodeURIComponent(id)}`),
    };
    this.audio = {
      transcribe: (params: AudioTranscribeParams) => this.transcribe(params),
      speech: (params) => this.speech(params),
    };
    this.batches = {
      create: (body: Record<string, unknown>) => this.request<BatchJob>("POST", "/v1/batches", body),
      get: (id: string) => this.request<BatchJob>("GET", `/v1/batches/${encodeURIComponent(id)}`),
      list: () => this.request("GET", "/v1/batches"),
    };
    this.embeddings = {
      create: (body) => this.request("POST", "/v1/embeddings", body),
    };
    this.rerank = {
      create: (body) => this.request("POST", "/v1/rerank", body),
    };
    this.responses = {
      create: (body) => this.request("POST", "/v1/responses", body),
    };
    this.files = {
      list: (purpose) =>
        this.request("GET", purpose ? `/v1/files?purpose=${encodeURIComponent(purpose)}` : "/v1/files"),
      get: (id) => this.request("GET", `/v1/files/${encodeURIComponent(id)}`),
      content: (id) => this.request("GET", `/v1/files/${encodeURIComponent(id)}/content`),
      delete: (id) => this.request("DELETE", `/v1/files/${encodeURIComponent(id)}`),
    };
    this.plugins = {
      webSearch: (body) => this.request("POST", "/v1/plugins/web-search", body),
    };
    this.catalog = {
      list: () => this.request("GET", "/v1/catalog"),
    };
    this.account = {
      get: () => this.request("GET", "/v1/account"),
      balance: () => this.request("GET", "/v1/account/balance"),
    };
    this.usage = {
      get: (params) =>
        this.request("GET", params?.days ? `/v1/usage?days=${params.days}` : "/v1/usage"),
      rateLimits: () => this.request("GET", "/v1/usage/rate-limits"),
    };
    this.requests = {
      list: (params) => {
        const q = new URLSearchParams();
        if (params?.limit) q.set("limit", String(params.limit));
        if (params?.status) q.set("status", params.status);
        if (params?.q) q.set("q", params.q);
        const suffix = q.toString() ? `?${q}` : "";
        return this.request("GET", `/v1/requests${suffix}`);
      },
      get: (id) => this.request("GET", `/v1/requests/${encodeURIComponent(id)}`),
    };
    this.keys = {
      list: () => this.request("GET", "/v1/keys"),
      create: (body = {}) => this.request("POST", "/v1/keys", body),
      delete: (id) => this.request("DELETE", `/v1/keys/${encodeURIComponent(id)}`),
    };
    this.assistants = {
      list: () => this.request("GET", "/v1/assistants"),
      create: (body) => this.request("POST", "/v1/assistants", body),
      get: (id) => this.request("GET", `/v1/assistants/${encodeURIComponent(id)}`),
      update: (id, body) => this.request("PATCH", `/v1/assistants/${encodeURIComponent(id)}`, body),
      delete: (id) => this.request("DELETE", `/v1/assistants/${encodeURIComponent(id)}`),
      chat: (id, body) =>
        this.request<ChatCompletion>("POST", `/v1/assistants/${encodeURIComponent(id)}/chat`, body),
    };
    this.workflows = {
      list: () => this.request("GET", "/v1/workflows"),
      create: (body) => this.request("POST", "/v1/workflows", body),
      get: (id) => this.request("GET", `/v1/workflows/${encodeURIComponent(id)}`),
      update: (id, body) => this.request("PATCH", `/v1/workflows/${encodeURIComponent(id)}`, body),
      delete: (id) => this.request("DELETE", `/v1/workflows/${encodeURIComponent(id)}`),
    run: (id, input = {}) => this.request("POST", `/v1/workflows/${encodeURIComponent(id)}/run`, input),
    runs: (id) => this.request("GET", `/v1/workflows/${encodeURIComponent(id)}/runs`),
    publish: (id, body: Record<string, unknown> = {}) =>
      this.request("POST", `/v1/workflows/${encodeURIComponent(id)}/publish`, body),
    versions: (id) => this.request("GET", `/v1/workflows/${encodeURIComponent(id)}/versions`),
    trigger: (id, body: Record<string, unknown> = {}) =>
      this.request("POST", `/v1/workflows/${encodeURIComponent(id)}/trigger`, body),
    };
    this.training = {
      datasets: {
        list: () => this.request("GET", "/v1/training/datasets"),
        create: (body) => this.request("POST", "/v1/training/datasets", body),
        get: (id) => this.request("GET", `/v1/training/datasets/${encodeURIComponent(id)}`),
      },
      jobs: {
        list: () => this.request("GET", "/v1/training/jobs"),
        create: (body) => this.request("POST", "/v1/training/jobs", body),
        get: (id) => this.request("GET", `/v1/training/jobs/${encodeURIComponent(id)}`),
      },
    };
    this.deployments = {
      list: () => this.request("GET", "/v1/deployments"),
      create: (body) => this.request("POST", "/v1/deployments", body),
      get: (id) => this.request("GET", `/v1/deployments/${encodeURIComponent(id)}`),
      delete: (id) => this.request("DELETE", `/v1/deployments/${encodeURIComponent(id)}`),
    };
    this.agents = {
      list: () => this.request("GET", "/v1/agents"),
      create: (body) => this.request("POST", "/v1/agents", body),
      get: (id) => this.request("GET", `/v1/agents/${encodeURIComponent(id)}`),
      update: (id, body) => this.request("PATCH", `/v1/agents/${encodeURIComponent(id)}`, body),
      chat: (id, body) => this.request("POST", `/v1/agents/${encodeURIComponent(id)}/chat`, body),
      agui: (id, body) =>
        this.raw("POST", `/v1/agents/${encodeURIComponent(id)}/ag-ui`, body),
      start: (id) => this.request("PATCH", `/v1/agents/${encodeURIComponent(id)}`, { status: "running" }),
      stop: (id) => this.request("PATCH", `/v1/agents/${encodeURIComponent(id)}`, { status: "stopped" }),
      computer: (id, control) =>
        this.request("PATCH", `/v1/agents/${encodeURIComponent(id)}`, { computerControl: control }),
      delete: (id) => this.request("DELETE", `/v1/agents/${encodeURIComponent(id)}`),
      restore: (id) => this.request("POST", `/v1/agents/${encodeURIComponent(id)}/restore`),
    };
    this.byok = {
      list: () => this.request("GET", "/v1/byok"),
      create: (body) => this.request("POST", "/v1/byok", body),
      delete: (id) => this.request("DELETE", `/v1/byok/${encodeURIComponent(id)}`),
    };
    this.policies = {
      list: () => this.request("GET", "/v1/policies"),
      create: (body) => this.request("POST", "/v1/policies", body),
      get: (id) => this.request("GET", `/v1/policies/${encodeURIComponent(id)}`),
      update: (id, body) => this.request("PATCH", `/v1/policies/${encodeURIComponent(id)}`, body),
      delete: (id) => this.request("DELETE", `/v1/policies/${encodeURIComponent(id)}`),
    };
    this.premium = {
      rentals: {
        list: () => this.request("GET", "/v1/premium/rentals"),
        create: (body = {}) => this.request("POST", "/v1/premium/rentals", body),
        get: (id) => this.request("GET", `/v1/premium/rentals/${encodeURIComponent(id)}`),
        delete: (id) => this.request("DELETE", `/v1/premium/rentals/${encodeURIComponent(id)}`),
      },
    };
  }

  private async speech(params: { input: string; model?: string; voice?: string }): Promise<ArrayBuffer> {
    const res = await this.raw("POST", "/v1/audio/speech", params);
    return res.arrayBuffer();
  }

  private async createChat(
    params: ChatCompletionCreateParams,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    if (params.stream) {
      const res = await this.raw("POST", "/v1/chat/completions", params);
      return iterateSse(res);
    }
    return this.request<ChatCompletion>("POST", "/v1/chat/completions", params);
  }

  private async transcribe(params: AudioTranscribeParams): Promise<Transcription> {
    const form = new FormData();
    const filename =
      params.filename ||
      (typeof File !== "undefined" && params.file instanceof File ? params.file.name : "audio");
    form.append("file", params.file, filename);
    form.append("model", params.model);
    if (params.language) form.append("language", params.language);
    return this.request<Transcription>("POST", "/v1/audio/transcriptions", form);
  }

  private async raw(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${this.baseURL}${path}`, { method, headers, body: payload });
    if (!res.ok) {
      const errBody = await parseBody(res);
      const errObj = errBody && typeof errBody === "object" ? (errBody as { error?: unknown }) : null;
      const errVal = errObj?.error;
      const message =
        (typeof errVal === "string" && errVal) ||
        (errVal && typeof errVal === "object" && "message" in errVal
          ? String((errVal as { message?: unknown }).message || "")
          : "") ||
        `OpenDoor request failed (${res.status})`;
      throw new OpenDoorError(message, res.status, errBody);
    }
    return res;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, path, body);
    return (await parseBody(res)) as T;
  }
}

export function createClient(opts?: OpenDoorOptions): OpenDoor {
  return new OpenDoor(opts);
}

export default OpenDoor;
