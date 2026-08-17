import type { ChatMessageContent } from "@opendoor/shared";
import { flattenMessageText } from "@opendoor/shared";

export function documentText(doc: string | { text: string }): string {
  return typeof doc === "string" ? doc : doc.text;
}

export function toAnthropicContent(content: ChatMessageContent) {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    const url = part.image_url.url;
    const data = url.match(/^data:([^;]+);base64,(.+)$/);
    if (data) {
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: data[1],
          data: data[2],
        },
      };
    }
    return {
      type: "image" as const,
      source: { type: "url" as const, url },
    };
  });
}

export function toGeminiParts(content: ChatMessageContent) {
  if (typeof content === "string") return [{ text: content }];
  return content.map((part) => {
    if (part.type === "text") return { text: part.text };
    const url = part.image_url.url;
    const data = url.match(/^data:([^;]+);base64,(.+)$/);
    if (data) {
      return { inlineData: { mimeType: data[1], data: data[2] } };
    }
    return { text: `[image ${url.slice(0, 80)}]` };
  });
}

export function toPlainPrompt(content: ChatMessageContent): string {
  return flattenMessageText(content);
}
