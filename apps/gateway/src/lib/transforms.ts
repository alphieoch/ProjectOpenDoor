import { flattenMessageText, type ChatMessage } from "@opendoor/shared";
import { estimateTokens } from "../utils/streaming.js";

export type TransformName = "middle-out";

export function requestedTransforms(value: unknown): TransformName[] {
  if (!Array.isArray(value)) return [];
  const out: TransformName[] = [];
  for (const item of value) {
    if (item === "middle-out") out.push("middle-out");
  }
  return out;
}

function messageTokens(message: ChatMessage): number {
  return estimateTokens(flattenMessageText(message.content)) + 8;
}

function messagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + messageTokens(message), 0);
}

function clipMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const keep = Math.max(32, Math.floor(maxChars / 2) - 8);
  return `${text.slice(0, keep)}\n…\n${text.slice(-keep)}`;
}

function clipMessage(message: ChatMessage, maxTokens: number): ChatMessage {
  const text = flattenMessageText(message.content);
  const maxChars = Math.max(64, maxTokens * 4);
  if (text.length <= maxChars) return message;
  return { ...message, content: clipMiddle(text, maxChars) };
}

/** Drop the middle of a long prompt. Keeps system messages plus first/last slices. */
export function applyMiddleOut(
  messages: ChatMessage[],
  opts: { contextWindow: number; maxTokens?: number }
): ChatMessage[] {
  const reserve = Math.max(1, opts.maxTokens ?? 1024);
  const budget = Math.max(256, opts.contextWindow - reserve - 32);
  if (messagesTokens(messages) <= budget) return messages;

  const system = messages.filter((m) => m.role === "system");
  let rest = messages.filter((m) => m.role !== "system");
  const systemCost = messagesTokens(system);
  const restBudget = Math.max(128, budget - systemCost);

  rest = rest.map((message) => {
    const cap = Math.max(64, Math.floor(restBudget / Math.max(1, Math.min(rest.length, 4))));
    return messageTokens(message) > cap ? clipMessage(message, cap) : message;
  });

  while (messagesTokens(rest) > restBudget && rest.length > 2) {
    rest.splice(Math.floor(rest.length / 2), 1);
  }

  if (messagesTokens(rest) > restBudget && rest.length > 1) {
    rest = [rest[rest.length - 1]];
  }
  if (rest.length === 1 && messagesTokens(rest) > restBudget) {
    rest = [clipMessage(rest[0], restBudget)];
  }

  return [...system, ...rest];
}

export function applyMessageTransforms(
  messages: ChatMessage[],
  opts: {
    transforms?: unknown;
    contextWindow?: number | null;
    maxTokens?: number;
  }
): ChatMessage[] {
  const names = requestedTransforms(opts.transforms);
  if (!names.includes("middle-out")) return messages;
  const contextWindow = opts.contextWindow ?? 0;
  if (contextWindow <= 0) return messages;
  return applyMiddleOut(messages, {
    contextWindow,
    maxTokens: opts.maxTokens,
  });
}
