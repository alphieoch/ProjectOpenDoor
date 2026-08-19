"use client";

import { User, Wrench, Loader2 } from "lucide-react";
import { AiCrest } from "@/components/ui/ai-crest";
import { ChatMessageContent } from "./ChatMessageContent";
import { ChatMessageActions } from "./ChatMessageActions";

export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  state: "call" | "result" | string;
}

interface ChatMessageProps {
  id: string;
  role: "user" | "assistant";
  content?: string;
  toolInvocations?: ToolInvocation[];
  primaryColor: string;
  avatarLetter: string;
  logoUrl?: string | null;
  isDark?: boolean;
  streaming?: boolean;
  vote?: boolean | null;
  onVote?: (isUpvoted: boolean) => void;
  onRegenerate?: () => void;
}

export function ChatMessage({
  role,
  content,
  toolInvocations,
  logoUrl,
  isDark,
  streaming,
  vote,
  onVote,
  onRegenerate,
}: ChatMessageProps) {
  const isAssistant = role === "assistant";

  return (
    <div className={`group flex gap-3 ${isAssistant ? "flex-row" : "flex-row-reverse"}`}>
      {/* Assistant avatar */}
      {isAssistant && (
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center select-none mt-0.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <AiCrest mood={streaming ? "thinking" : "ready"} size="sm" />
          )}
        </div>
      )}

      {/* User avatar — minimal dot */}
      {!isAssistant && (
        <div
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white select-none mt-0.5"
          style={{ background: "var(--ink-3)" }}
        >
          <User className="w-4 h-4" />
        </div>
      )}

      {/* Content */}
      <div className={`flex flex-col gap-0.5 ${isAssistant ? "items-start" : "items-end"} max-w-[85%] sm:max-w-[80%]`}>
        {/* Tool invocations */}
        {toolInvocations?.map((tool) => (
          <div
            key={tool.toolCallId}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs border"
            style={{
              background: "var(--paper-3)",
              color: "var(--ink-3)",
              borderColor: "var(--line)",
            }}
          >
            <Wrench className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono">{tool.toolName}</span>
            {tool.state !== "result" && (
              <Loader2 className="w-3 h-3 animate-spin ml-auto" />
            )}
          </div>
        ))}

        {/* Message content — NO bubble background */}
        {content && (
          <div className="py-1">
            <ChatMessageContent
              role={role}
              content={content}
              isDark={isDark}
            />
          </div>
        )}

        {/* Actions */}
        <ChatMessageActions
          role={role}
          content={content}
          streaming={streaming}
          vote={vote}
          onVote={onVote}
          onRegenerate={onRegenerate}
        />
      </div>
    </div>
  );
}
