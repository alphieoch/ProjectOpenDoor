"use client";

import { AiCrest } from "@/components/ui/ai-crest";

interface ChatThinkingProps {
  logoUrl?: string | null;
}

export function ChatThinking({ logoUrl }: ChatThinkingProps) {
  return (
    <div className="flex gap-3 items-start">
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center mt-0.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
        ) : (
          <AiCrest mood="thinking" size="sm" />
        )}
      </div>

      <div
        className="flex items-center gap-2 rounded-2xl px-4 py-3"
        style={{ background: "var(--paper-2)" }}
      >
        <AiCrest mood="thinking" size={16} />
        <span
          className="text-sm font-medium shimmer-text"
          style={{ color: "var(--ink-3)" }}
        >
          Thinking...
        </span>
      </div>
    </div>
  );
}
