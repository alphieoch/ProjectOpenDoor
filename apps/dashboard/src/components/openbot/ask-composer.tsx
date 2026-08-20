"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { OPENBOT_ROSTER } from "@/lib/openbot-personas";
import { cn } from "@/lib/utils";

export function AskComposer({
  compact = false,
  pending = false,
  disabled = false,
  placeholder = "Ask anything",
  fallbackName,
  agents = [],
  onSubmit,
}: {
  compact?: boolean;
  pending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  fallbackName?: string;
  agents?: Array<{ id: string; name: string }>;
  onSubmit: (text: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);

  const mentionQuery = useMemo(() => {
    const match = value.match(/^@([^\n]*)$/);
    return match ? (match[1] || "").toLowerCase() : null;
  }, [value]);

  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const personas = OPENBOT_ROSTER.filter((persona) =>
      persona.name.toLowerCase().includes(mentionQuery),
    );
    const extras = agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(mentionQuery) &&
        !OPENBOT_ROSTER.some((persona) => persona.name.toLowerCase() === agent.name.toLowerCase()),
    );
    return [
      ...personas.map((persona) => ({ id: persona.id, name: persona.name })),
      ...extras,
    ].slice(0, 6);
  }, [agents, mentionQuery]);

  async function submit() {
    const text = value.trim();
    if (!text || disabled || pending) return;
    setValue("");
    setMentionOpen(false);
    await onSubmit(text);
  }

  function pickMention(name: string) {
    setValue(`@${name} `);
    setMentionOpen(false);
  }

  return (
    <form
      className={cn("relative w-full", !compact && "max-w-2xl")}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {mentionOpen && mentionQuery !== null && mentionOptions.length > 0 ? (
        <div className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl">
          {mentionOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
              onClick={() => pickMention(option.name)}
            >
              @{option.name}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-end gap-2 border border-border bg-card focus-within:border-ring",
          compact ? "min-h-14 items-center rounded-2xl px-3 py-2" : "rounded-2xl px-4 pb-2 pt-3",
        )}
      >
        <textarea
          value={value}
          disabled={disabled || pending}
          placeholder={placeholder}
          rows={compact ? 1 : 2}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            setMentionOpen(next.startsWith("@"));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="max-h-40 min-h-[22px] min-w-0 flex-1 resize-none bg-transparent text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={disabled || pending || !value.trim()}
          className="mb-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
        </button>
      </div>
      {fallbackName && !compact ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Goes to {fallbackName}. Type <code className="text-foreground/70">@</code> to reach somebody else.
        </p>
      ) : null}
    </form>
  );
}
