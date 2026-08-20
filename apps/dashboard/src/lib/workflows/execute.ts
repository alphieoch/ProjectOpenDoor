import {
  interpolate,
  MAX_LOOP_ITEMS,
  MAX_SUBFLOW_DEPTH,
  parseLoopItems,
  resolveAssignee,
  retryPolicy,
  slaDueAt,
  SYNC_WAIT_LIMIT_MS,
  waitDurationMs,
  type TemplateContext,
} from "@opendoor/shared";
import {
  runWebSearch,
  WebSearchNotConfiguredError,
  WebSearchProviderError,
  type WebSearchResult,
} from "@/lib/web-search";
import { resolveCodeLanguage, runWorkflowCode } from "@/lib/workflows/code-execution";
import { conditionEdgeTaken, evaluateCondition } from "@/lib/workflows/condition";
import {
  gatewayJson,
  type WorkflowGatewayContext,
} from "@/lib/workflows/gateway";
import { runWorkflowHttp } from "@/lib/workflows/http";
import { ragSearch, RagSearchNotConfiguredError } from "@/lib/tools/rag-search";

export type WorkflowGraphNode = {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
};

export type WorkflowGraphEdge = {
  source?: string;
  target?: string;
  label?: string;
  sourceHandle?: string;
};

export type WorkflowGraph = {
  nodes?: WorkflowGraphNode[];
  edges?: WorkflowGraphEdge[];
};

export type WorkflowStepResult = {
  nodeId: string;
  type: string;
  toolType?: string;
  status: "ok" | "error" | "skipped" | "awaiting_review" | "awaiting_wait";
  code?: "unsupported" | "not_configured";
  query?: string;
  provider?: string;
  results?: WebSearchResult["results"];
  images?: Array<{ url?: string; b64_json?: string }>;
  text?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  passed?: boolean;
  embedding?: { model: string; dimensions: number };
  assignedTo?: string;
  dueAt?: string;
  resumeAt?: string;
  attempt?: number;
  variable?: string;
  httpStatus?: number;
  items?: number;
  error?: string;
};

export type WorkflowPause = {
  nodeId: string;
  reason: "review" | "wait";
  resumeAt?: string;
  dueAt?: string;
  assignedTo?: string;
};

export type ExecuteWorkflowOptions = {
  resumeAfterNodeId?: string;
  initialText?: string;
  existingSteps?: WorkflowStepResult[];
  variables?: Record<string, string>;
  payload?: Record<string, unknown>;
  resolveSubflow?: (id: string) => Promise<{ graph: WorkflowGraph; name?: string } | null>;
  subflowDepth?: number;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
  fetchHttp?: typeof fetch;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function templateCtx(opts: {
  lastText: string;
  query: string;
  vars: Record<string, string>;
  steps: WorkflowStepResult[];
  payload?: Record<string, unknown>;
  item?: string;
  index?: number;
}): TemplateContext {
  const steps: TemplateContext["steps"] = {};
  for (const step of opts.steps) {
    steps[step.nodeId] = { text: step.text, status: step.status, passed: step.passed };
  }
  return {
    input: opts.query || opts.lastText,
    query: opts.query || opts.lastText,
    vars: opts.vars,
    steps,
    payload: opts.payload,
    item: opts.item,
    index: opts.index,
  };
}

async function withRetry(
  node: WorkflowGraphNode,
  run: () => Promise<WorkflowStepResult>,
  sleep: (ms: number) => Promise<void>
): Promise<WorkflowStepResult> {
  const policy = retryPolicy(node.data);
  let last: WorkflowStepResult | undefined;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    last = await run();
    last.attempt = attempt + 1;
    if (last.status !== "error") return last;
    if (attempt < policy.retries && policy.delayMs) await sleep(policy.delayMs);
  }
  return last!;
}

function toolTypeOf(node: WorkflowGraphNode): string {
  const data = node.data || {};
  return str(data.toolType) || str(data.tool) || (node.type === "web_search" ? "web_search" : "");
}

export function graphHasWebSearch(graph: WorkflowGraph): boolean {
  return (graph.nodes || []).some((node) => {
    if (node.type !== "tool" && node.type !== "web_search") return false;
    const tool = toolTypeOf(node);
    return tool === "web_search" || tool === "search" || node.type === "web_search";
  });
}

function inputQuery(graph: WorkflowGraph): string {
  const nodes = graph.nodes || [];
  const input = nodes.find((n) => n.type === "input");
  if (!input?.data) return "";
  return (
    str(input.data.query) ||
    str(input.data.prompt) ||
    str(input.data.value) ||
    str(input.data.label)
  );
}

function nodeQuery(node: WorkflowGraphNode, fallback: string, ctx?: TemplateContext): string {
  const data = node.data || {};
  const raw = str(data.query) || str(data.searchQuery) || str(data.prompt) || fallback;
  return ctx ? interpolate(raw, ctx) : raw;
}

function topologicalNodes(graph: WorkflowGraph): WorkflowGraphNode[] {
  const nodes = graph.nodes || [];
  if (!nodes.length) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, 0);
    outgoing.set(n.id, []);
  }
  for (const edge of graph.edges || []) {
    if (!edge.source || !edge.target) continue;
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const queue = nodes.filter((n) => (incoming.get(n.id) || 0) === 0);
  const ordered: WorkflowGraphNode[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const node = queue.shift()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    ordered.push(node);
    for (const next of outgoing.get(node.id) || []) {
      incoming.set(next, (incoming.get(next) || 0) - 1);
      if ((incoming.get(next) || 0) === 0) {
        const found = byId.get(next);
        if (found) queue.push(found);
      }
    }
  }
  for (const node of nodes) {
    if (!seen.has(node.id)) ordered.push(node);
  }
  return ordered;
}

function descendantsOf(graph: WorkflowGraph, startIds: string[]): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const n of graph.nodes || []) outgoing.set(n.id, []);
  for (const edge of graph.edges || []) {
    if (!edge.source || !edge.target) continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const seen = new Set<string>();
  const queue = [...startIds];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of outgoing.get(id) || []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

function branchSkipSet(graph: WorkflowGraph, conditionId: string, passed: boolean): Set<string> {
  const outgoing = (graph.edges || []).filter((e) => e.source === conditionId && e.target);
  const tagged = outgoing.filter((e) => conditionEdgeTaken(e, passed) !== null);
  if (!tagged.length) return new Set();
  const takenTargets = outgoing
    .filter((e) => conditionEdgeTaken(e, passed) !== false)
    .map((e) => e.target!);
  const rejectedTargets = tagged
    .filter((e) => conditionEdgeTaken(e, passed) === false)
    .map((e) => e.target!);
  const rejected = descendantsOf(graph, rejectedTargets);
  const taken = descendantsOf(graph, takenTargets);
  return new Set([...rejected].filter((id) => !taken.has(id)));
}

async function runCodeExecution(
  node: WorkflowGraphNode,
  fallback: string
): Promise<WorkflowStepResult> {
  const data = node.data || {};
  const code = typeof data.code === "string" ? data.code : "";
  const language = resolveCodeLanguage(data.language ?? data.lang);
  if (!code.trim()) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "code_execution",
      status: "error",
      error: "Set Code on the code_execution node.",
    };
  }
  if (!language) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "code_execution",
      status: "error",
      error: "language must be javascript or python.",
    };
  }
  try {
    const result = await runWorkflowCode({ language, code, stdin: fallback });
    const text = result.stdout.trim() || result.stderr.trim();
    const failed = result.timedOut || result.exitCode !== 0;
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "code_execution",
      status: failed ? "error" : "ok",
      provider: result.jail ? `${language}/${result.jail}` : language,
      query: language,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      text,
      error: failed
        ? result.timedOut
          ? "Code execution timed out."
          : result.stderr.trim() || `Exit ${result.exitCode}`
        : undefined,
    };
  } catch (err) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "code_execution",
      status: "error",
      provider: language,
      error: err instanceof Error ? err.message : "Code execution failed",
    };
  }
}

function gatewayError(data: Record<string, unknown>, fallback: string): string {
  const err = data.error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  return fallback;
}

async function runImageGeneration(
  node: WorkflowGraphNode,
  prompt: string,
  ctx: WorkflowGatewayContext
): Promise<WorkflowStepResult> {
  const data = node.data || {};
  if (!prompt) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "image_generation",
      status: "error",
      error: "No prompt. Set Prompt on the image_generation node, or pass { query } when running.",
    };
  }
  if (!ctx.configured) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "image_generation",
      status: "error",
      code: "not_configured",
      query: prompt,
      error: "Image generation is not configured. Set GATEWAY_INTERNAL_KEY or INTERNAL_API_KEY.",
    };
  }
  const model = str(data.modelId) || str(data.model) || "dall-e-3";
  const size = str(data.size) || "1024x1024";
  const { ok, status, data: body } = await gatewayJson<Record<string, unknown>>(
    ctx,
    "/v1/images/generations",
    {
      method: "POST",
      body: JSON.stringify({ prompt, model, n: 1, size }),
    }
  );
  if (!ok) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "image_generation",
      status: "error",
      code: status === 503 ? "not_configured" : undefined,
      query: prompt,
      provider: "openai",
      error: gatewayError(body, status === 503
        ? "Image generation is not configured (OpenAI or Azure Foundry)."
        : "Image generation failed"),
    };
  }
  const images = Array.isArray(body.data)
    ? (body.data as Array<{ url?: string; b64_json?: string }>)
    : [];
  return {
    nodeId: node.id,
    type: "tool",
    toolType: "image_generation",
    status: "ok",
    query: prompt,
    provider: "openai",
    images,
    text: images[0]?.url || (images[0]?.b64_json ? "[image]" : ""),
  };
}

async function runDocumentAnalysis(
  node: WorkflowGraphNode,
  fallback: string,
  ctx: WorkflowGatewayContext
): Promise<WorkflowStepResult> {
  const fileId = str(node.data?.fileId) || str(node.data?.file_id) || fallback;
  if (!fileId) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "document_analysis",
      status: "error",
      error: "Set File ID on the document_analysis node (a /v1/files id).",
    };
  }
  if (!ctx.configured) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "document_analysis",
      status: "error",
      code: "not_configured",
      error: "Gateway is not configured. Set GATEWAY_INTERNAL_KEY or INTERNAL_API_KEY.",
    };
  }
  const { ok, data } = await gatewayJson<Record<string, unknown>>(
    ctx,
    `/v1/files/${encodeURIComponent(fileId)}/content`
  );
  if (!ok) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "document_analysis",
      status: "error",
      error: gatewayError(data, "File text is not available"),
    };
  }
  const text = typeof data.text === "string" ? data.text : "";
  return {
    nodeId: node.id,
    type: "tool",
    toolType: "document_analysis",
    status: "ok",
    query: fileId,
    provider: "files",
    text,
  };
}

async function runDataExtraction(
  node: WorkflowGraphNode,
  input: string,
  ctx: WorkflowGatewayContext
): Promise<WorkflowStepResult> {
  const text = nodeQuery(node, input);
  if (!text) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "data_extraction",
      status: "error",
      error: "No text to embed. Set Prompt on the node or pass { query } when running.",
    };
  }
  if (!ctx.configured) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "data_extraction",
      status: "error",
      code: "not_configured",
      error: "Gateway is not configured. Set GATEWAY_INTERNAL_KEY or INTERNAL_API_KEY.",
    };
  }
  const model = str(node.data?.modelId) || str(node.data?.model) || "text-embedding-3-small";
  const { ok, data } = await gatewayJson<Record<string, unknown>>(ctx, "/v1/embeddings", {
    method: "POST",
    body: JSON.stringify({ model, input: text }),
  });
  if (!ok) {
    return {
      nodeId: node.id,
      type: "tool",
      toolType: "data_extraction",
      status: "error",
      query: text.slice(0, 200),
      error: gatewayError(data, "Embeddings request failed"),
    };
  }
  const first = Array.isArray(data.data) ? (data.data[0] as { embedding?: number[] } | undefined) : undefined;
  const dimensions = Array.isArray(first?.embedding) ? first.embedding.length : 0;
  return {
    nodeId: node.id,
    type: "tool",
    toolType: "data_extraction",
    status: "ok",
    query: text.slice(0, 200),
    provider: "embeddings",
    embedding: { model: typeof data.model === "string" ? data.model : model, dimensions },
    text: `embedding ${dimensions}d via ${model}`,
  };
}

async function runLlm(
  node: WorkflowGraphNode,
  input: string,
  ctx: WorkflowGatewayContext
): Promise<WorkflowStepResult> {
  const prompt = nodeQuery(node, input);
  const model = str(node.data?.modelId) || "llama-3.1-8b-instruct";
  if (!prompt) {
    return {
      nodeId: node.id,
      type: "llm",
      status: "error",
      error: "No prompt. Set a system prompt plus Run input, or a prompt on the LLM node.",
    };
  }
  if (!ctx.configured) {
    return {
      nodeId: node.id,
      type: "llm",
      status: "error",
      code: "not_configured",
      error: "Gateway is not configured. Set GATEWAY_INTERNAL_KEY or INTERNAL_API_KEY.",
    };
  }
  const system = str(node.data?.systemPrompt);
  const messages: Array<{ role: string; content: string }> = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const temperature = typeof node.data?.temperature === "number" ? node.data.temperature : 0.7;
  const maxTokens = typeof node.data?.maxTokens === "number" ? node.data.maxTokens : 2048;
  const { ok, data } = await gatewayJson<Record<string, unknown>>(ctx, "/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  if (!ok) {
    return {
      nodeId: node.id,
      type: "llm",
      status: "error",
      query: prompt.slice(0, 200),
      error: gatewayError(data, "LLM call failed"),
    };
  }
  const choice = Array.isArray(data.choices) ? (data.choices[0] as { message?: { content?: unknown } }) : undefined;
  const text = typeof choice?.message?.content === "string" ? choice.message.content : "";
  return {
    nodeId: node.id,
    type: "llm",
    status: "ok",
    query: prompt.slice(0, 200),
    provider: typeof data.model === "string" ? data.model : model,
    text,
  };
}

async function runTool(
  node: WorkflowGraphNode,
  fallback: string,
  maxResults: number | undefined,
  ctx: WorkflowGatewayContext | undefined
): Promise<WorkflowStepResult> {
  const toolType = toolTypeOf(node) || "unknown";
  if (toolType === "web_search") {
    const query = nodeQuery(node, fallback) || str(node.data?.description);
    const limit = typeof node.data?.maxResults === "number" ? node.data.maxResults : maxResults;
    if (!query) {
      return {
        nodeId: node.id,
        type: "tool",
        toolType,
        status: "error",
        error:
          "No search query. Set Query on the web_search node, or pass { query } when running the workflow.",
      };
    }
    try {
      const result = await runWebSearch(query, limit);
      return {
        nodeId: node.id,
        type: "tool",
        toolType,
        status: "ok",
        query: result.query,
        provider: result.provider,
        results: result.results,
        text: result.results.map((hit) => `${hit.title} ${hit.url}`).join("\n"),
      };
    } catch (err) {
      const message =
        err instanceof WebSearchNotConfiguredError || err instanceof WebSearchProviderError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Web search failed";
      return {
        nodeId: node.id,
        type: "tool",
        toolType,
        status: "error",
        query,
        error: message,
      };
    }
  }

  if (toolType === "search") {
    const query = nodeQuery(node, fallback) || str(node.data?.description);
    const limit = typeof node.data?.maxResults === "number" ? node.data.maxResults : maxResults;
    if (!query) {
      return {
        nodeId: node.id,
        type: "tool",
        toolType,
        status: "error",
        error: "No search query. Set Query on the Search node, or pass { query } when running.",
      };
    }
    try {
      const result = await ragSearch({
        query,
        maxResults: limit,
      });
      return {
        nodeId: node.id,
        type: "tool",
        toolType,
        status: "ok",
        query,
        provider: result.provider,
        results: result.citations,
        text: result.answer,
      };
    } catch (err) {
      return {
        nodeId: node.id,
        type: "tool",
        toolType,
        status: "error",
        code: err instanceof RagSearchNotConfiguredError ? "not_configured" : undefined,
        query,
        error: err instanceof Error ? err.message : "Search failed",
      };
    }
  }

  if (toolType === "code_execution") {
    return runCodeExecution(node, fallback);
  }

  if (toolType === "image_generation") {
    if (!ctx) {
      return {
        nodeId: node.id,
        type: "tool",
        toolType,
        status: "error",
        code: "not_configured",
        error: "Image generation is not configured.",
      };
    }
    return runImageGeneration(node, nodeQuery(node, fallback), ctx);
  }

  if (toolType === "document_analysis") {
    if (!ctx) {
      return {
        nodeId: node.id,
        type: "tool",
        toolType,
        status: "error",
        code: "not_configured",
        error: "Document analysis is not configured.",
      };
    }
    return runDocumentAnalysis(node, fallback, ctx);
  }

  if (toolType === "data_extraction") {
    if (!ctx) {
      return {
        nodeId: node.id,
        type: "tool",
        toolType,
        status: "error",
        code: "not_configured",
        error: "Data extraction is not configured.",
      };
    }
    return runDataExtraction(node, fallback, ctx);
  }

  return {
    nodeId: node.id,
    type: "tool",
    toolType,
    status: "skipped",
    code: "unsupported",
    error: `unsupported tool: ${toolType}`,
  };
}

export type ExecuteWorkflowResult = {
  steps: WorkflowStepResult[];
  search: WebSearchResult | null;
  paused?: WorkflowPause;
  halted?: boolean;
  vars: Record<string, string>;
  assignedTo?: string;
  dueAt?: string;
  resumeAt?: string;
};

export async function executeWorkflowGraph(
  graph: WorkflowGraph,
  input?: { query?: string; maxResults?: number; payload?: Record<string, unknown> },
  ctx?: WorkflowGatewayContext,
  opts?: ExecuteWorkflowOptions
): Promise<ExecuteWorkflowResult> {
  const nodes = topologicalNodes(graph);
  if (!nodes.length) {
    throw new Error("This workflow has no nodes.");
  }

  const fallback = str(input?.query) || inputQuery(graph);
  const steps: WorkflowStepResult[] = [...(opts?.existingSteps || [])];
  const vars: Record<string, string> = { ...(opts?.variables || {}) };
  const payload = opts?.payload || input?.payload;
  const now = opts?.now || new Date();
  const sleep = opts?.sleep || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastSearch: WebSearchResult | null = null;
  let lastText = opts?.initialText || fallback;
  let skippingResume = Boolean(opts?.resumeAfterNodeId);
  let assignedTo: string | undefined;
  let dueAt: string | undefined;
  let resumeAt: string | undefined;
  const skipBranch = new Set<string>();
  const gateway = ctx || {
    organizationId: "",
    url: "",
    headers: {},
    configured: false,
  };

  const ctxNow = () =>
    templateCtx({ lastText, query: fallback, vars, steps, payload });

  const finishError = (step: WorkflowStepResult): ExecuteWorkflowResult | null => {
    if (step.status !== "error") return null;
    if (retryPolicy(nodes.find((n) => n.id === step.nodeId)?.data).onError !== "fail") return null;
    return { steps, search: lastSearch, halted: true, vars, assignedTo, dueAt, resumeAt };
  };

  for (const node of nodes) {
    if (skippingResume) {
      if (node.id === opts?.resumeAfterNodeId) skippingResume = false;
      continue;
    }

    const type = str(node.type) || "llm";

    if (skipBranch.has(node.id)) {
      steps.push({
        nodeId: node.id,
        type,
        status: "skipped",
        error: "Condition branch not taken",
      });
      continue;
    }

    if (type === "input") {
      const text = interpolate(fallback || str(node.data?.label) || lastText, ctxNow());
      lastText = text || lastText;
      steps.push({ nodeId: node.id, type, status: "ok", text: lastText });
      continue;
    }

    if (type === "output") {
      const template = str(node.data?.template);
      const text = template ? interpolate(template, ctxNow()) : lastText;
      lastText = text;
      steps.push({ nodeId: node.id, type, status: "ok", text });
      continue;
    }

    if (type === "human_review") {
      const note = interpolate(str(node.data?.reviewNote), ctxNow());
      const due = slaDueAt(node.data?.dueMinutes, now);
      const assignee = resolveAssignee(node.data, ctxNow());
      assignedTo = assignee || assignedTo;
      dueAt = due?.toISOString() || dueAt;
      steps.push({
        nodeId: node.id,
        type,
        status: "awaiting_review",
        text: lastText,
        assignedTo: assignee || undefined,
        dueAt: due?.toISOString(),
        error: note || "Paused for human review. Approve or reject this run.",
      });
      return {
        steps,
        search: lastSearch,
        paused: {
          nodeId: node.id,
          reason: "review",
          dueAt: due?.toISOString(),
          assignedTo: assignee || undefined,
        },
        vars,
        assignedTo,
        dueAt,
      };
    }

    if (type === "wait") {
      const ms = waitDurationMs(node.data);
      if (ms <= SYNC_WAIT_LIMIT_MS) {
        if (ms > 0) await sleep(ms);
        steps.push({
          nodeId: node.id,
          type,
          status: "ok",
          text: lastText,
          query: `${ms}ms`,
        });
        continue;
      }
      resumeAt = new Date(now.getTime() + ms).toISOString();
      steps.push({
        nodeId: node.id,
        type,
        status: "awaiting_wait",
        text: lastText,
        resumeAt,
        error: `Waiting until ${resumeAt}`,
      });
      return {
        steps,
        search: lastSearch,
        paused: { nodeId: node.id, reason: "wait", resumeAt },
        vars,
        assignedTo,
        dueAt,
        resumeAt,
      };
    }

    if (type === "loop") {
      const src = interpolate(str(node.data?.items) || lastText, ctxNow());
      const max = Number(node.data?.maxIterations ?? MAX_LOOP_ITEMS);
      const items = parseLoopItems(src, Number.isFinite(max) ? max : MAX_LOOP_ITEMS);
      const template = str(node.data?.template) || "{{item}}";
      const mapped = items.map((item, index) =>
        interpolate(template, templateCtx({ lastText, query: fallback, vars, steps, payload, item, index }))
      );
      const text = mapped.join(str(node.data?.join) || "\n");
      lastText = text || lastText;
      steps.push({
        nodeId: node.id,
        type,
        status: "ok",
        text: lastText,
        items: items.length,
        query: `${items.length} items`,
      });
      continue;
    }

    if (type === "assign") {
      const assignee = resolveAssignee(node.data, ctxNow());
      assignedTo = assignee || assignedTo;
      steps.push({
        nodeId: node.id,
        type,
        status: assignee ? "ok" : "error",
        assignedTo: assignee || undefined,
        text: assignee,
        error: assignee ? undefined : "Set assignee or queue on the assign node.",
      });
      const halted = finishError(steps[steps.length - 1]);
      if (halted) return halted;
      continue;
    }

    if (type === "set_variable") {
      const name = str(node.data?.name);
      const value = interpolate(str(node.data?.value) || lastText, ctxNow());
      if (!name) {
        const step: WorkflowStepResult = {
          nodeId: node.id,
          type,
          status: "error",
          error: "Set a variable name.",
        };
        steps.push(step);
        const halted = finishError(step);
        if (halted) return halted;
        continue;
      }
      vars[name] = value;
      lastText = value || lastText;
      steps.push({
        nodeId: node.id,
        type,
        status: "ok",
        variable: name,
        text: value,
      });
      continue;
    }

    if (type === "transform") {
      const template = str(node.data?.template) || str(node.data?.expression) || "{{input}}";
      const text = interpolate(template, ctxNow());
      lastText = text;
      steps.push({ nodeId: node.id, type, status: "ok", text });
      continue;
    }

    if (type === "http") {
      const step = await withRetry(node, async () => {
        const url = interpolate(str(node.data?.url), ctxNow());
        const body = interpolate(str(node.data?.body) || lastText, ctxNow());
        const result = await runWorkflowHttp({
          method: str(node.data?.method) || "POST",
          url,
          headers: node.data?.headers,
          body,
          fetchImpl: opts?.fetchHttp,
        });
        return {
          nodeId: node.id,
          type,
          status: result.ok ? "ok" : "error",
          query: url,
          httpStatus: result.status,
          text: result.text,
          error: result.ok ? undefined : result.error || `HTTP ${result.status}`,
        } satisfies WorkflowStepResult;
      }, sleep);
      steps.push(step);
      if (step.text) lastText = step.text;
      const halted = finishError(step);
      if (halted) return halted;
      continue;
    }

    if (type === "subflow") {
      const id = interpolate(str(node.data?.workflowId), ctxNow());
      if ((opts?.subflowDepth || 0) >= MAX_SUBFLOW_DEPTH) {
        const step: WorkflowStepResult = {
          nodeId: node.id,
          type,
          status: "error",
          error: "Subflow depth limit reached.",
        };
        steps.push(step);
        const halted = finishError(step);
        if (halted) return halted;
        continue;
      }
      if (!id || !opts?.resolveSubflow) {
        const step: WorkflowStepResult = {
          nodeId: node.id,
          type,
          status: "error",
          error: id ? "Subflow resolver is not configured." : "Set Workflow ID on the subflow node.",
        };
        steps.push(step);
        const halted = finishError(step);
        if (halted) return halted;
        continue;
      }
      const child = await opts.resolveSubflow(id);
      if (!child) {
        const step: WorkflowStepResult = {
          nodeId: node.id,
          type,
          status: "error",
          query: id,
          error: "Subflow was not found or is not published.",
        };
        steps.push(step);
        const halted = finishError(step);
        if (halted) return halted;
        continue;
      }
      const nested = await executeWorkflowGraph(child.graph, input, gateway, {
        ...opts,
        existingSteps: [],
        resumeAfterNodeId: undefined,
        initialText: lastText,
        variables: vars,
        subflowDepth: (opts.subflowDepth || 0) + 1,
      });
      const prefixed = nested.steps.map((s) => ({ ...s, nodeId: `${node.id}/${s.nodeId}` }));
      steps.push({
        nodeId: node.id,
        type,
        status: nested.halted ? "error" : nested.paused ? nested.paused.reason === "wait" ? "awaiting_wait" : "awaiting_review" : "ok",
        text: prefixed.filter((s) => s.text).at(-1)?.text || lastText,
        query: child.name || id,
        error: nested.halted ? "Subflow halted on error." : undefined,
      });
      steps.push(...prefixed);
      Object.assign(vars, nested.vars);
      assignedTo = nested.assignedTo || assignedTo;
      dueAt = nested.dueAt || dueAt;
      resumeAt = nested.resumeAt || resumeAt;
      if (nested.paused) {
        return {
          steps,
          search: nested.search || lastSearch,
          paused: {
            ...nested.paused,
            nodeId: `${node.id}/${nested.paused.nodeId}`,
          },
          vars,
          assignedTo,
          dueAt,
          resumeAt,
        };
      }
      if (nested.halted) {
        return { steps, search: lastSearch, halted: true, vars, assignedTo, dueAt, resumeAt };
      }
      const nestedText = prefixed.filter((s) => s.text).at(-1)?.text;
      if (nestedText) lastText = nestedText;
      continue;
    }

    if (type === "condition") {
      const expr = interpolate(str(node.data?.condition), ctxNow());
      const result = evaluateCondition(expr, lastText);
      if (!result.ok) {
        const step: WorkflowStepResult = {
          nodeId: node.id,
          type,
          status: "error",
          text: lastText,
          error: result.error,
        };
        steps.push(step);
        const halted = finishError(step);
        if (halted) return halted;
        continue;
      }
      for (const id of branchSkipSet(graph, node.id, result.passed)) skipBranch.add(id);
      steps.push({
        nodeId: node.id,
        type,
        status: "ok",
        passed: result.passed,
        text: lastText,
        query: expr || "(non-empty output)",
      });
      continue;
    }

    if (type === "llm") {
      const step = await withRetry(
        node,
        () => runLlm({ ...node, data: { ...node.data, prompt: nodeQuery(node, lastText, ctxNow()) } }, lastText, gateway),
        sleep
      );
      steps.push(step);
      if (step.text) lastText = step.text;
      const halted = finishError(step);
      if (halted) return halted;
      continue;
    }

    if (type === "tool" || type === "web_search") {
      const step = await withRetry(
        node,
        () => runTool(
          { ...node, data: { ...node.data, query: nodeQuery(node, lastText, ctxNow()), prompt: nodeQuery(node, lastText, ctxNow()) } },
          lastText,
          input?.maxResults,
          gateway
        ),
        sleep
      );
      steps.push(step);
      if (step.toolType === "web_search" && step.status === "ok" && step.results) {
        lastSearch = {
          provider: (step.provider || "vertex_google_search") as WebSearchResult["provider"],
          query: step.query || lastText,
          results: step.results,
          citations: step.results,
        };
      }
      if (step.text) lastText = step.text;
      const halted = finishError(step);
      if (halted) return halted;
      continue;
    }

    steps.push({
      nodeId: node.id,
      type,
      status: "skipped",
      code: "unsupported",
      error: `unsupported node: ${type}`,
    });
  }

  return { steps, search: lastSearch, vars, assignedTo, dueAt, resumeAt };
}
