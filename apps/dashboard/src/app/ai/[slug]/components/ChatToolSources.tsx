"use client";

import { ExternalLink } from "lucide-react";

interface Source {
  url: string;
  title?: string;
}

interface ChatToolSourcesProps {
  sources: Source[];
}

export function ChatToolSources({ sources }: ChatToolSourcesProps) {
  if (!sources.length) return null;

  return (
    <div className="flex flex-col gap-1 mt-2">
      {sources.map((source, i) => (
        <a
          key={i}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: "var(--brand)" }}
        >
          <ExternalLink className="w-3 h-3 shrink-0" />
          <span className="truncate">{source.title || source.url}</span>
        </a>
      ))}
    </div>
  );
}
