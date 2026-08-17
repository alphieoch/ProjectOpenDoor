"use client";

import { useState } from "react";
import {
  BookOpen,
  CalendarCheck,
  Code2,
  GraduationCap,
  Languages,
  MessageCircle,
  PenLine,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Liquid } from "@/components/ui/liquid-gooey";

export type HouseChatGuideId =
  | "ask"
  | "write"
  | "code"
  | "learn"
  | "language"
  | "plan"
  | "chat";

type Guide = {
  id: HouseChatGuideId;
  title: string;
  hint: string;
  icon: typeof BookOpen;
  questions: string[];
  childQuestions: string[];
  placeholder: string;
};

const GUIDES: Guide[] = [
  {
    id: "ask",
    title: "Answer questions",
    hint: "Science, history, tech, trivia",
    icon: BookOpen,
    placeholder: "Ask anything…",
    questions: [
      "Explain how Wi-Fi actually works, simply.",
      "What caused the 2008 financial crisis?",
      "Give me three surprising facts about octopuses.",
    ],
    childQuestions: [
      "Why is the sky blue?",
      "How do volcanoes work?",
      "Tell me a fun fact about space.",
    ],
  },
  {
    id: "write",
    title: "Writing & editing",
    hint: "Essays, emails, rewrites",
    icon: PenLine,
    placeholder: "What should we write?",
    questions: [
      "Help me draft a short, polite follow-up email.",
      "Rewrite this more clearly: ",
      "Outline a one-page essay on a topic I choose.",
    ],
    childQuestions: [
      "Help me start a short story about a talking fox.",
      "Make this sentence sound nicer: ",
      "Give me three title ideas for a school report.",
    ],
  },
  {
    id: "code",
    title: "Programming & tech",
    hint: "Code, debug, APIs",
    icon: Code2,
    placeholder: "What are you building?",
    questions: [
      "Explain this error and how to fix it: ",
      "Write a small Python script that…",
      "How do I call a REST API from JavaScript?",
    ],
    childQuestions: [
      "What is a computer program, in simple words?",
      "Help me make a tiny Scratch-style story in words.",
      "What does an API mean for a beginner?",
    ],
  },
  {
    id: "learn",
    title: "Learning & tutoring",
    hint: "Break it down, then practice",
    icon: GraduationCap,
    placeholder: "What are you studying?",
    questions: [
      "Teach me this from zero, in small steps: ",
      "Give me 5 practice problems on…",
      "I am stuck on this homework: ",
    ],
    childQuestions: [
      "Help me practice adding fractions.",
      "Explain photosynthesis like I am 10.",
      "Quiz me on the solar system.",
    ],
  },
  {
    id: "language",
    title: "Language support",
    hint: "Translate, practice, vocab",
    icon: Languages,
    placeholder: "Which language?",
    questions: [
      "Translate this to Spanish and explain the tone: ",
      "Give me 10 useful phrases for traveling in Japan.",
      "Correct my French and tell me why.",
    ],
    childQuestions: [
      "How do I say hello and thank you in Spanish?",
      "Teach me 8 animal words in French.",
      "What does this English word mean: ",
    ],
  },
  {
    id: "plan",
    title: "Planning",
    hint: "Lists, schedules, ideas",
    icon: CalendarCheck,
    placeholder: "What are we planning?",
    questions: [
      "Make a realistic weekly schedule for…",
      "Help me plan a weekend trip on a budget.",
      "Turn this messy goal into a 7-day plan: ",
    ],
    childQuestions: [
      "Help me plan a fun Saturday.",
      "Make a checklist for a school project.",
      "What should I pack for a sleepover?",
    ],
  },
  {
    id: "chat",
    title: "Just chat",
    hint: "Talk, jokes, what-if",
    icon: MessageCircle,
    placeholder: "Say hi, or pick a topic…",
    questions: [
      "I just want to talk. Ask me a good question.",
      "Tell me a clever joke, then explain why it works.",
      "What if cities ran on trains only — walk me through it.",
    ],
    childQuestions: [
      "Want to hear a silly joke?",
      "Let’s pretend we are explorers. You start.",
      "Ask me three fun questions.",
    ],
  },
];

export function looksLikeCapabilityGuide(text: string): boolean {
  const t = text.toLowerCase();
  const keys = [
    "what i can do",
    "here's what i can",
    "here’s what i can",
    "answer questions",
    "writing & editing",
    "programming & tech",
    "just chat",
    "no question is too",
    "what would you like to try",
  ];
  return keys.filter((k) => t.includes(k)).length >= 2;
}

export function looksLikeCapabilityAsk(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /what can you do|what do you do|how can you help|what are you good at/.test(t) ||
    t.trim() === "help" ||
    t.trim() === "capabilities"
  );
}

export function HouseChatGuides({
  protectedChild = false,
  disabled = false,
  compact = false,
  onAsk,
}: {
  protectedChild?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onAsk: (text: string) => void;
}) {
  const [openId, setOpenId] = useState<HouseChatGuideId | null>(null);
  const [draft, setDraft] = useState("");
  const open = GUIDES.find((g) => g.id === openId) || null;
  const suggestions = open
    ? protectedChild
      ? open.childQuestions
      : open.questions
    : [];

  const ask = (text: string) => {
    const next = text.trim();
    if (!next || disabled) return;
    setDraft("");
    onAsk(next);
  };

  return (
    <div className={cn("w-full", compact ? "mt-3" : "mt-5")}>
      {!compact && (
        <div className="mb-3">
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            What do you want to do?
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--ink-4)" }}>
            Open a box, ask a basic question, and we will go from there.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {GUIDES.map((guide) => {
          const Icon = guide.icon;
          const active = openId === guide.id;
          return (
            <button
              key={guide.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                setOpenId(active ? null : guide.id);
                setDraft("");
              }}
              className={cn(
                "flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50",
                active ? "sm:col-span-2" : ""
              )}
              style={{
                borderColor: active ? "var(--brand)" : "var(--line)",
                background: active ? "var(--brand-soft)" : "var(--paper-2)",
                color: "var(--ink)",
              }}
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--paper)", color: "var(--brand)" }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{guide.title}</span>
                <span className="block text-[11px]" style={{ color: "var(--ink-4)" }}>
                  {guide.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <Liquid
          blur={8}
          contrast={18}
          fill="var(--paper)"
          shadow="0 2px 10px rgba(0,0,0,0.08)"
          className="mt-2"
        >
          <Liquid.Item morph={{ shape: true }}>
            <div className="px-3.5 py-3">
              <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                {open.title}
              </p>
              <p className="text-xs mt-1 mb-2.5" style={{ color: "var(--ink-3)" }}>
                Pick a starter or type your own question. Keep it simple — we can go deeper after the first reply.
              </p>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={disabled}
                    onClick={() => ask(q)}
                    className="rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--paper-3)] disabled:opacity-50"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <form
                className="mt-3 flex items-center gap-2 rounded-full px-2 py-1"
                style={{ background: "var(--paper-2)" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(draft);
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={disabled}
                  placeholder={open.placeholder}
                  className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
                  style={{ color: "var(--ink)" }}
                />
                <button
                  type="submit"
                  disabled={disabled || !draft.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-40"
                  style={{ background: "var(--ink)", color: "var(--paper)" }}
                  aria-label="Ask"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </Liquid.Item>
        </Liquid>
      )}
    </div>
  );
}
