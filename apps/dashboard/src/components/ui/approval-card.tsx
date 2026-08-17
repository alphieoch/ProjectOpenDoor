"use client";

import { useState } from "react";

/* ─────────────────────────────────────────────────────────
 * APPROVAL CARD (human-in-the-loop)
 * One question at a time; elongated pills show progress;
 * the circular arrow up top advances (↑ sends on the last).
 * Choices, paging, and submission are directly controlled.
 * ───────────────────────────────────────────────────────── */

export type ApprovalQuestion = {
  q: string;
  type: "radio" | "check";
  options: string[];
};

const DEFAULT_QUESTIONS: ApprovalQuestion[] = [
  {
    q: "How many flavors should we launch?",
    type: "radio",
    options: ["Three (core line)", "Five (full case)", "Just one hero"],
  },
  {
    q: "Which mix-ins should we stock?",
    type: "check",
    options: ["Chocolate chips", "Waffle bits", "Sprinkles"],
  },
  {
    q: "Which market do we enter first?",
    type: "radio",
    options: ["Food trucks", "Grocery freezers", "Scoop shops"],
  },
];

export type ApprovalCardProps = {
  questions?: ApprovalQuestion[];
  onSubmitted?: (answers: { selected: Record<number, number[]>; custom: Record<number, string> }) => void;
  resettable?: boolean;
  className?: string;
};

export default function ApprovalCard({
  questions = DEFAULT_QUESTIONS,
  onSubmitted,
  resettable = true,
  className,
}: ApprovalCardProps) {
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(true);

  const questionList = questions.length > 0 ? questions : DEFAULT_QUESTIONS;
  const question = questionList[qi] || questionList[0];
  const last = qi === questionList.length - 1;
  const selected = answers[qi] ?? [];
  const hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim());

  const toggle = (index: number) => {
    const picked = answers[qi] ?? [];
    const next =
      question.type === "radio"
        ? [index]
        : picked.includes(index)
          ? picked.filter((item) => item !== index)
          : [...picked, index];

    const nextAnswers = { ...answers, [qi]: next };
    setAnswers(nextAnswers);

    if (question.type === "radio") {
      const nextCustom = { ...custom, [qi]: "" };
      setCustom(nextCustom);
      // single-choice auto-advances
      window.setTimeout(() => {
        if (qi === questionList.length - 1) {
          setSent(true);
          onSubmitted?.({ selected: nextAnswers, custom: nextCustom });
        } else {
          setQi((current) => Math.min(questionList.length - 1, current + 1));
        }
      }, 480);
    }
  };

  const reset = () => {
    setQi(0);
    setAnswers({});
    setCustom({});
    setSent(false);
    setOpen(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border px-3 py-2 text-[12.5px] font-medium shadow-sm transition-colors duration-150 hover:bg-[var(--paper-3)]"
        style={{
          borderColor: "var(--line)",
          background: "var(--paper-2)",
          color: "var(--ink)",
        }}
      >
        Open approval
      </button>
    );
  }

  // Once answered, the whole card fires off into a small confirmation badge.
  if (sent) {
    return (
      <div
        className={`flex w-full max-w-sm items-center gap-3 ${className || ""}`}
        style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12.5px] font-medium"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          <span
            className="flex size-4.5 items-center justify-center rounded-full text-white"
            style={{ background: "var(--brand)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          Answers sent
        </span>
        {resettable && (
          <button
            type="button"
            onClick={reset}
            className="text-[12px] font-medium transition-colors duration-150 hover:text-[var(--ink)]"
            style={{ color: "var(--ink-3)" }}
          >
            Start over
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex min-h-[196px] w-full max-w-sm flex-col items-stretch ${className || ""}`}>
      <div
        className="w-full self-start overflow-hidden rounded-2xl border shadow-lg"
        style={{
          borderColor: "var(--line)",
          background: "var(--paper-2)",
        }}
      >
        <div key={qi} className="p-4" style={{ animation: "fade-up 350ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
              {question.q}
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-md p-1 transition-colors duration-100 hover:bg-[var(--paper-3)]"
              style={{ color: "var(--ink-4)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {question.options.map((option, i) => {
              const on = selected.includes(i);
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(i)}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors duration-100 hover:bg-[var(--paper-3)]"
                  style={{
                    background: on ? "var(--brand-soft)" : "transparent",
                  }}
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center transition-colors duration-200 ${
                      question.type === "radio" ? "rounded-full" : "rounded-md"
                    }`}
                    style={{
                      background: on ? "var(--ink)" : "transparent",
                      border: on ? "none" : "1.5px solid var(--line)",
                      color: "var(--paper)",
                    }}
                  >
                    {question.type === "radio" ? (
                      <span
                        className="size-1.5 rounded-full transition-transform duration-200"
                        style={{
                          background: "var(--paper)",
                          transform: on ? "scale(1)" : "scale(0)",
                        }}
                      />
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span
                    className="text-[13px] transition-colors duration-200"
                    style={{
                      color: on ? "var(--ink)" : "var(--ink-2)",
                      fontWeight: on ? 600 : 400,
                    }}
                  >
                    {option}
                  </span>
                </button>
              );
            })}
            <label className="mt-1 flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors duration-100 hover:bg-[var(--paper-3)] focus-within:bg-[var(--paper-3)]">
              <span aria-hidden="true" className="size-4 shrink-0" />
              <input
                value={custom[qi] ?? ""}
                onChange={(event) => {
                  setCustom((current) => ({ ...current, [qi]: event.target.value }));
                  if (question.type === "radio") setAnswers((current) => ({ ...current, [qi]: [] }));
                }}
                placeholder="Type something…"
                aria-label="Custom answer"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: "var(--ink)" }}
              />
            </label>
          </div>
        </div>

        {/* footer — ring-dot pager + send arrow */}
        <div
          className="flex items-center justify-between border-t px-4 py-2.5"
          style={{
            borderColor: "var(--line)",
            background: "var(--paper-3)",
          }}
        >
          <span className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous"
              disabled={qi === 0 || sent}
              onClick={() => setQi((current) => Math.max(0, current - 1))}
              className="flex size-6 items-center justify-center rounded-md transition-colors duration-100 enabled:hover:bg-[var(--paper-2)] disabled:opacity-35"
              style={{ color: "var(--ink-3)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className="flex items-center gap-1.5">
              {questionList.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to question ${i + 1}`}
                  aria-current={i === qi && !sent ? "step" : undefined}
                  disabled={sent}
                  onClick={() => setQi(i)}
                  className="rounded-full transition-all duration-300 disabled:cursor-default"
                  style={
                    i === qi && !sent
                      ? { width: 9, height: 9, border: "2.5px solid var(--ink)" }
                      : sent || i < qi
                        ? { width: 7, height: 7, background: "var(--ink-3)" }
                        : { width: 7, height: 7, border: "1.5px solid var(--ink-4)" }
                  }
                />
              ))}
            </span>
            <button
              type="button"
              aria-label="Next"
              disabled={last || sent}
              onClick={() => setQi((current) => Math.min(questionList.length - 1, current + 1))}
              className="flex size-6 items-center justify-center rounded-md transition-colors duration-100 enabled:hover:bg-[var(--paper-2)] disabled:opacity-35"
              style={{ color: "var(--ink-3)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </span>
          {!sent && (
            <button
              type="button"
              aria-label={last ? "Send answers" : "Next question"}
              disabled={!hasAnswer}
              onClick={() => {
                if (last) {
                  setSent(true);
                  onSubmitted?.({ selected: answers, custom });
                } else {
                  setQi((current) => current + 1);
                }
              }}
              className="flex size-7 items-center justify-center rounded-lg transition-all duration-200 enabled:active:scale-[0.96] disabled:opacity-40"
              style={{
                background: hasAnswer ? "var(--ink)" : "var(--paper-2)",
                color: hasAnswer ? "var(--paper)" : "var(--ink-4)",
                boxShadow: hasAnswer ? "inset 0 1px 0 rgba(255,255,255,0.14)" : "none",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
