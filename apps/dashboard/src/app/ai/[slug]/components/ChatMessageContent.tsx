"use client";

import { MarkdownContent } from "./MarkdownContent";

interface ChatMessageContentProps {
  role: "user" | "assistant";
  content?: string;
  isDark?: boolean;
}

export function ChatMessageContent({
  role,
  content,
  isDark,
}: ChatMessageContentProps) {
  if (!content) return null;

  if (role === "assistant") {
    return (
      <div className="text-sm leading-relaxed">
        <MarkdownContent content={content} isDark={isDark} />
      </div>
    );
  }

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
  );
}
