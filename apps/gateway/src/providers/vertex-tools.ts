import type { ChatMessage, ToolCall, ToolDefinition } from "@opendoor/shared";
import { flattenMessageText } from "@opendoor/shared";
import { toGeminiParts } from "./content.js";

export const VERTEX_TOOL_OVERFLOW_MODEL = "gemini-2.5-flash";

/** When a MaaS OpenAI path rejects tools, retry the same Vertex client on Gemini. */
export function vertexToolOverflowModel(modelId: string): string | null {
  if (!modelId || modelId.startsWith("gemini-")) return null;
  return VERTEX_TOOL_OVERFLOW_MODEL;
}

export function geminiFunctionDeclarations(tools?: ToolDefinition[]) {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description || "",
    parameters: tool.function.parameters || { type: "object", properties: {} },
  }));
}

export function geminiContentsFromMessages(messages: ChatMessage[]) {
  const system: string[] = [];
  const contents: Array<{ role: string; parts: unknown[] }> = [];
  let lastCalls: ToolCall[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      system.push(flattenMessageText(message.content));
      continue;
    }
    if (message.role === "tool") {
      const match = lastCalls.find((call) => call.id === message.tool_call_id);
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.name || match?.function.name || "tool",
              response: { result: flattenMessageText(message.content) },
            },
          },
        ],
      });
      continue;
    }
    if (message.role === "assistant") {
      lastCalls = message.tool_calls || [];
      const parts: unknown[] = [];
      const text = flattenMessageText(message.content);
      if (text) parts.push({ text });
      for (const call of lastCalls) {
        let args: unknown = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        parts.push({ functionCall: { name: call.function.name, args } });
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }
    contents.push({ role: "user", parts: toGeminiParts(message.content) });
  }

  return { system: system.filter(Boolean).join("\n\n"), contents };
}

export function geminiPartsToMessage(parts: Array<Record<string, unknown>> | undefined) {
  const texts: string[] = [];
  const tool_calls: ToolCall[] = [];
  for (const part of parts || []) {
    if (typeof part.text === "string" && part.text) texts.push(part.text);
    const call = part.functionCall as { name?: string; args?: unknown; arguments?: unknown } | undefined;
    if (call?.name) {
      const args = call.args ?? call.arguments ?? {};
      tool_calls.push({
        id: `call_${tool_calls.length + 1}`,
        type: "function",
        function: {
          name: call.name,
          arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
        },
      });
    }
  }
  return {
    text: texts.join(""),
    tool_calls,
    finish_reason: tool_calls.length ? ("tool_calls" as const) : ("stop" as const),
  };
}
