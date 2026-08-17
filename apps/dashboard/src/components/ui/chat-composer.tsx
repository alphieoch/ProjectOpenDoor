"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";

/* ─────────────────────────────────────────────────────────
 * CHAT — interactive panel with tabs, replies, and composer.
 * The reply sequence begins only after the user sends.
 * ───────────────────────────────────────────────────────── */

type Phase = "idle" | "sent" | "reply1" | "reply2" | "done";

export type ChatComposerSection = {
  label: string;
  sub: string;
  time: string;
  body: string;
};

export type ChatComposerProps = {
  tabs?: string[];
  initialPrompt?: string;
  onSend?: (prompt: string, tab: string) => void;
  className?: string;
};

function Section({
  label,
  sub,
  time,
  body,
  resolving,
}: {
  label: string;
  sub: string;
  time: string;
  body: string;
  resolving?: boolean;
}) {
  return (
    <div
      className="flex w-full flex-col gap-1.5 transition-all duration-400"
      style={{
        opacity: resolving ? 0.55 : 1,
        filter: resolving ? "blur(0.5px)" : "blur(0)",
        transform: resolving ? "scale(0.985)" : "scale(1)",
        transformOrigin: "top left",
        transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) both",
      }}
    >
      <div className="flex items-center gap-1.5 text-[12px] leading-[1.3]">
        <span className="font-semibold" style={{ color: "var(--ink)" }}>{label}</span>
        <span style={{ color: "var(--ink-3)" }}>{sub}</span>
        <span style={{ color: "var(--ink-4)" }}>for {time}</span>
      </div>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink)" }}>{body}</p>
    </div>
  );
}

export default function ChatComposer({
  tabs = ["Flavors", "Suppliers"],
  initialPrompt = "Compare mint chip to last summer",
  onSend,
  className,
}: ChatComposerProps) {
  const [phase, setPhase] = useState<Phase>("done");
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState(initialPrompt);
  const [tab, setTab] = useState(tabs[0] || "Flavors");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "sent") t = setTimeout(() => setPhase("reply1"), 500);
    else if (phase === "reply1") t = setTimeout(() => setPhase("reply2"), 1400);
    else if (phase === "reply2") t = setTimeout(() => setPhase("done"), 1200);
    else return;
    return () => clearTimeout(t);
  }, [phase]);

  const sent = phase !== "idle";
  const canSend = draft.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    const text = draft.trim();
    setSubmitted(text);
    try {
      posthog?.capture?.("chat_composer_prompt_sent", { prompt: text, tab });
    } catch {
      // ignore
    }
    onSend?.(text, tab);
    setDraft("");
    setPhase("sent");
  };

  return (
    <div
      className={`flex h-[288px] w-full max-w-sm flex-col self-start overflow-hidden rounded-2xl border shadow-lg ${className || ""}`}
      style={{
        borderColor: "var(--line)",
        background: "var(--paper-2)",
      }}
    >
      {/* header — tabs + actions */}
      <div
        className="flex shrink-0 items-center justify-between border-b p-2"
        style={{
          borderColor: "var(--line)",
          background: "var(--paper-3)",
        }}
      >
        <div className="flex items-center gap-1">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-150"
              style={{
                background: tab === item ? "var(--paper-2)" : "transparent",
                color: tab === item ? "var(--ink)" : "var(--ink-3)",
                boxShadow: tab === item ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {[
            <path key="p" d="M12 5v14M5 12h14" />,
            <g key="h"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></g>,
            <g key="e" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></g>,
          ].map((icon, i) => (
            <button
              key={i}
              type="button"
              aria-label="Action"
              className="flex size-6 items-center justify-center rounded-md transition-colors duration-100 hover:bg-[var(--paper-2)]"
              style={{ color: "var(--ink-3)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {icon}
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* conversation — fixed region so the card never changes shape */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 pt-3 pb-1">
        {/* user bubble — right aligned, soft block */}
        <div className="flex justify-end pl-10">
          <div
            className="rounded-xl px-3 py-1.5 text-[13px] leading-[1.4] transition-all duration-300"
            style={{
              background: "var(--paper-3)",
              color: "var(--ink)",
              opacity: sent ? 1 : 0,
              transform: sent ? "translateY(0)" : "translateY(10px)",
              transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          >
            {submitted}
          </div>
        </div>

        {phase === "reply1" || phase === "reply2" || phase === "done" ? (
          <Section
            label="Sales History"
            sub="Flavor Data"
            time="4s"
            body="Pulled 3 summers of mint chip sales for comparison."
          />
        ) : null}
        {phase === "reply2" || phase === "done" ? (
          <Section
            label="Comparison"
            sub="Trend Detection"
            time="2s"
            body="Mint chip is up 12% with stronger weekend peaks."
            resolving={phase === "reply2"}
          />
        ) : null}
      </div>

      {/* composer */}
      <div className="mt-auto shrink-0 p-2">
        <div
          role="presentation"
          onClick={() => inputRef.current?.focus()}
          className="flex cursor-text flex-col gap-2 rounded-xl border p-2.5 transition-all duration-150 focus-within:border-[var(--line-strong)]"
          style={{
            borderColor: "var(--line)",
            background: "var(--paper-3)",
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            placeholder="Prompt or tag a flavor with @"
            aria-label="Chat prompt"
            className="min-h-4.5 bg-transparent text-[13px] leading-[1.4] outline-none"
            style={{
              color: "var(--ink)",
            }}
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              aria-label="Send"
              disabled={!canSend}
              onClick={send}
              className="flex size-7 items-center justify-center rounded-lg transition-all duration-200 enabled:active:scale-[0.96] disabled:opacity-35"
              style={{
                background: canSend ? "var(--ink)" : "var(--line)",
                color: canSend ? "var(--paper)" : "var(--ink-4)",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
