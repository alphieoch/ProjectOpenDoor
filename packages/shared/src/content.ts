import type { ChatMessageContent } from "./types.js";

/** Flatten OpenAI-style string or multimodal parts to plain text (policy, tokens, Cohere). */
export function flattenMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const p = part as { type?: string; text?: string };
        if (p.type === "text" && typeof p.text === "string") return p.text;
        if (p.type === "image_url") return "[image]";
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  if (content == null) return "";
  return String(content);
}

/** Map text in a message (string or parts) through `fn`. Image parts are unchanged. */
export function mapMessageText(
  content: ChatMessageContent,
  fn: (text: string) => string
): ChatMessageContent {
  if (typeof content === "string") return fn(content);
  return content.map((part) =>
    part.type === "text" ? { ...part, text: fn(part.text) } : part
  );
}
