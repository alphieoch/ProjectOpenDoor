import { Hono } from "hono";
import { randomBytes } from "crypto";
import type { ChatMessage } from "@opendoor/shared";
import { flattenMessageText } from "@opendoor/shared";
import { resolveProvider } from "../providers/index.js";

const responsesRouter = new Hono();

const ROLES = new Set<ChatMessage["role"]>(["system", "user", "assistant", "tool"]);

function requireApiKey(c: { get: (k: "apiKey") => unknown }) {
  return c.get("apiKey") ?? null;
}

function partText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const p = part as { type?: string; text?: string; input_text?: string; output_text?: string };
  if (typeof p.text === "string") return p.text;
  if (typeof p.input_text === "string") return p.input_text;
  if (typeof p.output_text === "string") return p.output_text;
  return flattenMessageText(part);
}

function toMessages(input: unknown): ChatMessage[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }
  if (!Array.isArray(input)) {
    throw new Error("input must be a string or message array");
  }
  return input.map((item) => {
    if (typeof item === "string") {
      return { role: "user" as const, content: item };
    }
    const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const roleRaw = typeof raw.role === "string" ? raw.role : "user";
    const role = ROLES.has(roleRaw as ChatMessage["role"])
      ? (roleRaw as ChatMessage["role"])
      : "user";
    const content = raw.content;
    if (typeof content === "string") {
      return { role, content };
    }
    if (Array.isArray(content)) {
      return { role, content: content.map(partText).filter(Boolean).join("\n") };
    }
    return { role, content: flattenMessageText(content) };
  });
}

responsesRouter.post("/", async (c) => {
  if (!requireApiKey(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: {
    model?: unknown;
    input?: unknown;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    user?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body.model !== "string" || !body.model) {
    return c.json({ error: "model is required" }, 400);
  }
  if (body.input == null) {
    return c.json({ error: "input is required" }, 400);
  }

  let messages: ChatMessage[];
  try {
    messages = toMessages(body.input);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid input" }, 400);
  }
  if (messages.length === 0) {
    return c.json({ error: "input must not be empty" }, 400);
  }

  const resolved = await resolveProvider(body.model);
  if (!resolved) {
    return c.json({ error: `Model not found: ${body.model}` }, 404);
  }

  let completion;
  try {
    completion = await resolved.provider.chatCompletion({
      model: resolved.model,
      messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      top_p: body.top_p,
      user: body.user,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provider request failed";
    return c.json({ error: message }, 502);
  }

  const text = flattenMessageText(completion.choices?.[0]?.message?.content);
  const inputTokens = completion.usage?.prompt_tokens || 0;
  const outputTokens = completion.usage?.completion_tokens || 0;

  return c.json({
    id: `resp_${randomBytes(12).toString("hex")}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: body.model,
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: completion.usage?.total_tokens || inputTokens + outputTokens,
    },
  });
});

export default responsesRouter;
