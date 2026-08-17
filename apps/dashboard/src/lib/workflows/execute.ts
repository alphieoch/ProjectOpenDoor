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
  status: "ok" | "error" | "skipped" | "awaiting_review";
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
  error?: string;
};

export type ExecuteWorkflowOptions = {
  resumeAfterNodeId?: string;
  initialText?: string;
  existingSteps?: WorkflowStepResult[];
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toolTypeOf(node: WorkflowGraphNode): string {
  const data = node.data || {};
  return str(data.toolType) || str(data.tool) || (node.type === "web_search" ? "web_search" : "");
}

export function graphHasWebSearch(graph: WorkflowGraph): boolean {
  return (graph.nodes || []).some((node) => {
    if (node.type !== "tool" && node.type !== "web_search") return false;
    const tool = toolTypeOf(node);
    return tool === "web_search" || node.type === "web_search";
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

function nodeQuery(node: WorkflowGraphNode, fallback: string): string {
  const data = node.data || {};
  return str(data.query) || str(data.searchQuery) || str(data.prompt) || fallback;
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

export async function executeWorkflowGraph(
  graph: WorkflowGraph,
  input?: { query?: string; maxResults?: number },
  ctx?: WorkflowGatewayContext,
  opts?: ExecuteWorkflowOptions
): Promise<{
  steps: WorkflowStepResult[];
  search: WebSearchResult | null;
  paused?: { nodeId: string };
}> {
  const nodes = topologicalNodes(graph);
  if (!nodes.length) {
    throw new Error("This workflow has no nodes.");
  }

  const fallback = str(input?.query) || inputQuery(graph);
  const steps: WorkflowStepResult[] = [...(opts?.existingSteps || [])];
  let lastSearch: WebSearchResult | null = null;
  let lastText = opts?.initialText || fallback;
  let skippingResume = Boolean(opts?.resumeAfterNodeId);
  const skipBranch = new Set<string>();

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
      const text = fallback || str(node.data?.label);
      lastText = text || lastText;
      steps.push({ nodeId: node.id, type, status: "ok", text: lastText });
      continue;
    }

    if (type === "output") {
      steps.push({ nodeId: node.id, type, status: "ok", text: lastText });
      continue;
    }

    if (type === "human_review") {
      const note = str(node.data?.reviewNote);
      steps.push({
        nodeId: node.id,
        type,
        status: "awaiting_review",
        text: lastText,
        error: note || "Paused for human review. Approve or reject this run.",
      });
      return { steps, search: lastSearch, paused: { nodeId: node.id } };
    }

    if (type === "condition") {
      const expr = str(node.data?.condition);
      const result = evaluateCondition(expr, lastText);
      if (!result.ok) {
        steps.push({
          nodeId: node.id,
          type,
          status: "error",
          text: lastText,
          error: result.error,
        });
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

    if (type === "transform") {
      steps.push({ nodeId: node.id, type, status: "ok", text: lastText });
      continue;
    }

    if (type === "llm") {
      const step = await runLlm(node, lastText, ctx || {
        organizationId: "",
        url: "",
        headers: {},
        configured: false,
      });
      steps.push(step);
      if (step.text) lastText = step.text;
      continue;
    }

    if (type === "tool" || type === "web_search") {
      const step = await runTool(node, lastText, input?.maxResults, ctx);
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

  return { steps, search: lastSearch };
}
