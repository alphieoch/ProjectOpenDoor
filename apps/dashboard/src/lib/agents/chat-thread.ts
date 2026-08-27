export type ThreadMessage = {
  role: string;
  content: string;
};

export const TURN_FAILURE_REPLY =
  "I couldn't complete that reply. Send the message again if you still need it.";

export function collapseConsecutiveDuplicateUserMessages<T extends ThreadMessage>(messages: T[]): T[] {
  const out: T[] = [];
  for (const message of messages) {
    const prev = out[out.length - 1];
    if (
      message.role === "user" &&
      prev?.role === "user" &&
      prev.content.trim() === message.content.trim()
    ) {
      out[out.length - 1] = message;
      continue;
    }
    out.push(message);
  }
  return out;
}

export function messagesForModel<T extends ThreadMessage>(
  rows: T[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return collapseConsecutiveDuplicateUserMessages(rows)
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
}

export function isComputerToolName(name: string | null | undefined) {
  return (name || "").trim().toLowerCase().startsWith("computer_");
}

export function turnUsedComputer(events: Array<{ name?: string | null }>) {
  return events.some((event) => isComputerToolName(event.name));
}

export function openBotChatStatusLine(input: { sending: boolean; usedComputer: boolean }) {
  if (!input.sending) return null;
  if (input.usedComputer) return "Working on its computer…";
  return "Thinking…";
}

export function formatTurnFailureReply() {
  return TURN_FAILURE_REPLY;
}
