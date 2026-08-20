"use client";

import { RotateCcw } from "lucide-react";
import { AiCrest } from "@/components/ui/ai-crest";

interface ChatErrorProps {
  message: string;
  href?: string;
  hrefLabel?: string;
  onRetry?: () => void;
}

export function ChatError({ message, href, hrefLabel, onRetry }: ChatErrorProps) {
  return (
    <div className="flex justify-center px-4 py-2">
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3 max-w-lg w-full border"
        style={{
          background: "var(--md-error-container)",
          borderColor: "var(--md-error)",
          color: "var(--md-on-error-container)",
        }}
      >
        <AiCrest mood="error" size={16} />
        <div className="flex-1 min-w-0">
          <p className="text-sm">{message}</p>
          {href && (
            <a href={href} className="mt-1 inline-block text-xs font-medium underline underline-offset-2">
              {hrefLabel || "Open billing"}
            </a>
          )}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5"
          >
            <RotateCcw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
