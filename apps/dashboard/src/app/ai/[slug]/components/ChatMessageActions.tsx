"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
} from "lucide-react";

interface ChatMessageActionsProps {
  role: "user" | "assistant";
  content?: string;
  streaming?: boolean;
  vote?: boolean | null;
  onVote?: (isUpvoted: boolean) => void;
  onRegenerate?: () => void;
}

export function ChatMessageActions({
  role,
  content,
  streaming,
  vote,
  onVote,
  onRegenerate,
}: ChatMessageActionsProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  if (role === "assistant" && !streaming) {
    return (
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
        <button
          onClick={copy}
          className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: "var(--ink-3)" }}
          title="Copy response"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          onClick={() => onVote?.(true)}
          className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: vote === true ? "var(--md-primary)" : "var(--ink-3)" }}
          title="Good response"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onVote?.(false)}
          className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: vote === false ? "var(--md-error)" : "var(--ink-3)" }}
          title="Bad response"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onRegenerate}
          className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: "var(--ink-3)" }}
          title="Regenerate response"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return null;
}
