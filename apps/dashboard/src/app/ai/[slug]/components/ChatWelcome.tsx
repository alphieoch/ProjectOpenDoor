"use client";

import {
  Sparkles,
  Zap,
  MessageSquare,
  Lightbulb,
  HelpCircle,
} from "lucide-react";

interface ChatWelcomeProps {
  assistantName: string;
  assistantDescription?: string | null;
  welcomeMessage?: string | null;
  primaryColor: string;
  avatarLetter: string;
  logoUrl?: string | null;
  onSelectPrompt: (prompt: string) => void;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const DEFAULT_PROMPTS = [
  { label: "What can you help me with?", icon: HelpCircle },
  { label: "Tell me about yourself", icon: MessageSquare },
  { label: "Give me an example", icon: Lightbulb },
  { label: "Help me get started", icon: Zap },
];

export function ChatWelcome({
  assistantName,
  assistantDescription,
  welcomeMessage,
  primaryColor,
  avatarLetter,
  logoUrl,
  onSelectPrompt,
}: ChatWelcomeProps) {
  const greeting = getGreeting();

  const quickPrompts = welcomeMessage
    ? [
        { label: "What can you help me with?", icon: HelpCircle },
        {
          label:
            welcomeMessage.slice(0, 50) +
            (welcomeMessage.length > 50 ? "…" : ""),
          icon: MessageSquare,
        },
        { label: "Give me an example", icon: Lightbulb },
        { label: "Help me get started", icon: Zap },
      ]
    : DEFAULT_PROMPTS;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-16">
      {/* Avatar */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md"
        style={{ background: primaryColor }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={assistantName}
            className="w-full h-full object-cover rounded-2xl"
          />
        ) : (
          avatarLetter
        )}
      </div>

      {/* Greeting */}
      <div className="text-center space-y-1">
        <h1
          className="text-2xl sm:text-3xl font-bold"
          style={{ color: "var(--ink)" }}
        >
          {greeting}
        </h1>
        <p className="text-sm sm:text-base" style={{ color: "var(--ink-2)" }}>
          How can{" "}
          <span className="font-semibold" style={{ color: "var(--ink)" }}>
            {assistantName}
          </span>{" "}
          help you today?
        </p>
      </div>

      {/* Description */}
      {assistantDescription && (
        <p
          className="text-center text-sm max-w-md"
          style={{ color: "var(--ink-3)" }}
        >
          {assistantDescription}
        </p>
      )}

      {/* Welcome message card */}
      {welcomeMessage && (
        <div
          className="max-w-md w-full rounded-2xl p-4 text-sm border"
          style={{
            background: "var(--paper-2)",
            borderColor: "var(--line)",
            color: "var(--ink-2)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: primaryColor }} />
            <span
              className="font-semibold text-xs uppercase tracking-wide"
              style={{ color: "var(--ink-3)" }}
            >
              Welcome
            </span>
          </div>
          <p className="leading-relaxed">{welcomeMessage}</p>
        </div>
      )}

      {/* Quick prompt chips */}
      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        {quickPrompts.map((prompt, i) => {
          const Icon = prompt.icon;
          return (
            <button
              key={i}
              onClick={() => onSelectPrompt(prompt.label)}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition-all hover:shadow-sm active:scale-95"
              style={{
                background: "var(--paper-2)",
                borderColor: "var(--line)",
                color: "var(--ink-2)",
              }}
            >
              <Icon
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: primaryColor }}
              />
              <span className="truncate max-w-[200px]">{prompt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
