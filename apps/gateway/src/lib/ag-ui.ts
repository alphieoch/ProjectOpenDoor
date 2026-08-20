import { runAgentChat } from "./workspace-agent.js";
import type { workspaceAgents } from "@opendoor/database";

type AgUiInput = {
  threadId?: string;
  runId?: string;
  messages?: Array<{ role?: string; content?: unknown }>;
};

function sse(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function runAgentAgui(row: typeof workspaceAgents.$inferSelect, input: AgUiInput) {
  const threadId = input.threadId || row.id;
  const runId = input.runId || crypto.randomUUID();
  const lastUser = [...(input.messages || [])].reverse().find((m) => m.role === "user");
  const message = typeof lastUser?.content === "string" ? lastUser.content.trim() : "";
  if (!message) {
    return new Response(sse({ type: "RUN_ERROR", message: "message is required" }), {
      status: 400,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sse(event)));
      send({ type: "RUN_STARTED", threadId, runId });
      try {
        const result = await runAgentChat(row, message);
        for (const event of result.events) {
          const toolCallId = `call_${runId}_${event.name}`;
          send({ type: "TOOL_CALL_START", toolCallId, toolCallName: event.name, parentMessageId: `msg_${runId}` });
          send({ type: "TOOL_CALL_ARGS", toolCallId, delta: JSON.stringify({ ok: event.ok, detail: event.detail }) });
          send({ type: "TOOL_CALL_END", toolCallId });
        }
        const messageId = `msg_${runId}`;
        send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
        send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: result.reply });
        send({ type: "TEXT_MESSAGE_END", messageId });
        send({ type: "RUN_FINISHED", threadId, runId });
      } catch (err) {
        send({
          type: "RUN_ERROR",
          message: err instanceof Error ? err.message : "The Bot could not answer.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
