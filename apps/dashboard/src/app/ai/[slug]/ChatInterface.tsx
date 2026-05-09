"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { ChatMessage, type ToolInvocation } from "./components/ChatMessage";
import { ChatPrompt } from "./components/ChatPrompt";
import { ChatWelcome } from "./components/ChatWelcome";
import { ChatIndicator } from "./components/ChatIndicator";
import { ChatError } from "./components/ChatError";

interface ChatInterfaceProps {
  slug: string;
  welcomeMessage: string | null;
  primaryColor: string;
  avatarLetter: string;
  logoUrl?: string | null;
  maxMessages: number | null;
  assistantName: string;
  assistantDescription?: string | null;
}

export function ChatInterface({
  slug,
  welcomeMessage,
  primaryColor,
  avatarLetter,
  logoUrl,
  maxMessages,
  assistantName,
  assistantDescription,
}: ChatInterfaceProps) {
  const transport = new DefaultChatTransport({ api: `/api/ai/${slug}/chat` });
  const { messages, sendMessage, status, error } = useChat({
    transport,
    initialMessages: welcomeMessage
      ? [{ id: "welcome", role: "assistant" as const, content: welcomeMessage }]
      : [],
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [votes, setVotes] = useState<Record<string, boolean | null>>({});

  const isLoading = status === "submitted" || status === "streaming";
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const limitReached = maxMessages !== null && userMessageCount >= maxMessages;

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function submitMessage(text?: string) {
    const messageText = (text ?? draft).trim();
    if (!messageText || isLoading || limitReached) return;
    setDraft("");
    await sendMessage({ text: messageText });
  }

  function handleVote(messageId: string, isUpvoted: boolean) {
    setVotes((prev) => {
      const current = prev[messageId];
      const toggling = current === isUpvoted;
      return { ...prev, [messageId]: toggling ? null : isUpvoted };
    });
  }

  function handleRegenerate(messageId: string) {
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex <= 0) return;
    const userMsg = messages[msgIndex - 1];
    if (userMsg?.role === "user" && userMsg.content) {
      submitMessage(userMsg.content);
    }
  }

  const errorMessage = error
    ? (() => {
        try {
          const parsed = JSON.parse(error.message);
          return parsed.error ?? parsed.message ?? error.message;
        } catch {
          return error.message ?? "Something went wrong. Please try again.";
        }
      })()
    : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-4 space-y-5">
          {messages.length === 0 && (
            <ChatWelcome
              assistantName={assistantName}
              assistantDescription={assistantDescription}
              welcomeMessage={welcomeMessage}
              primaryColor={primaryColor}
              avatarLetter={avatarLetter}
              logoUrl={logoUrl}
              onSelectPrompt={(prompt) => submitMessage(prompt)}
            />
          )}

          {messages.map((msg, index) => {
            const isLast = index === messages.length - 1;
            const isStreaming = isLoading && isLast && msg.role === "assistant";
            return (
              <ChatMessage
                key={msg.id}
                id={msg.id}
                role={msg.role as "user" | "assistant"}
                content={msg.content}
                toolInvocations={msg.toolInvocations as ToolInvocation[] | undefined}
                primaryColor={primaryColor}
                avatarLetter={avatarLetter}
                logoUrl={logoUrl}
                isDark={isDark}
                streaming={isStreaming}
                vote={votes[msg.id]}
                onVote={(up) => handleVote(msg.id, up)}
                onRegenerate={() => handleRegenerate(msg.id)}
              />
            );
          })}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-3 items-start">
              <div
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white overflow-hidden mt-0.5"
                style={{ background: primaryColor }}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
                ) : (
                  avatarLetter
                )}
              </div>
              <div className="flex items-center gap-2 py-2">
                <ChatIndicator />
                <span
                  className="text-sm font-medium shimmer-text"
                  style={{ color: "var(--ink-3)" }}
                >
                  Thinking...
                </span>
              </div>
            </div>
          )}

          {errorMessage && (
            <ChatError
              message={errorMessage}
              onRetry={() => {
                const lastUserMsg = [...messages]
                  .reverse()
                  .find((m) => m.role === "user");
                if (lastUserMsg?.content) {
                  submitMessage(lastUserMsg.content);
                }
              }}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          {limitReached ? (
            <div className="text-center py-4">
              <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                Message limit reached for this session.
              </p>
            </div>
          ) : (
            <>
              <ChatPrompt
                value={draft}
                onChange={setDraft}
                onSubmit={() => submitMessage()}
                disabled={limitReached}
                isLoading={isLoading}
                primaryColor={primaryColor}
              />
              <p
                className="text-center text-[11px] mt-2"
                style={{ color: "var(--ink-3)" }}
              >
                AI can make mistakes. Please verify important information.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
