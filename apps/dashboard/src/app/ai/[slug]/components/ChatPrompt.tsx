"use client";

import { useRef, useState, KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatPromptProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  primaryColor: string;
  placeholder?: string;
}

export function ChatPrompt({
  value,
  onChange,
  onSubmit,
  disabled,
  isLoading,
  primaryColor,
  placeholder = "Ask anything...",
}: ChatPromptProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isLoading && value.trim()) {
        onSubmit();
      }
    }
  }

  return (
    <div
      className={`
        flex items-end gap-2 rounded-2xl border px-3 py-2.5 shadow-sm
        transition-all duration-200
        ${focused ? "shadow-md ring-2" : ""}
      `}
      style={{
        background: "var(--paper-2)",
        borderColor: focused ? primaryColor : "var(--line)",
        boxShadow: focused ? `0 0 0 2px ${primaryColor}33` : undefined,
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        rows={1}
        disabled={disabled || isLoading}
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none disabled:opacity-50 transition-all"
        style={{ maxHeight: "160px", minHeight: "20px" }}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim() || isLoading || disabled}
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white disabled:opacity-40 transition-all active:scale-95 mb-0.5"
        style={{ background: primaryColor }}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Send className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
