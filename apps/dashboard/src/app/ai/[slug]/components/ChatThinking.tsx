"use client";

interface ChatThinkingProps {
  primaryColor: string;
  logoUrl?: string | null;
  avatarLetter: string;
}

export function ChatThinking({ primaryColor, logoUrl, avatarLetter }: ChatThinkingProps) {
  return (
    <div className="flex gap-3 items-start">
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden"
        style={{ background: primaryColor }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
        ) : (
          avatarLetter
        )}
      </div>

      {/* Thinking indicator */}
      <div
        className="flex items-center gap-2 rounded-2xl px-4 py-3"
        style={{ background: "var(--paper-2)" }}
      >
        <div className="flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: primaryColor, animationDelay: "0ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: primaryColor, animationDelay: "150ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: primaryColor, animationDelay: "300ms" }}
          />
        </div>
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
