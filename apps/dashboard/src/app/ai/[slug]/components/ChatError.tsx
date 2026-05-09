"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

interface ChatErrorProps {
  message: string;
  onRetry?: () => void;
}

export function ChatError({ message, onRetry }: ChatErrorProps) {
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
        <AlertCircle className="w-4 h-4 shrink-0" />
        <p className="text-sm flex-1">{message}</p>
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
