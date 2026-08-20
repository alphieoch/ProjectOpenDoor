"use client";

import { Check } from "lucide-react";
import type { HouseChatMode } from "@opendoor/shared";
import { Liquid } from "@/components/ui/liquid-gooey";

type ModeOption = { id: HouseChatMode; label: string; hint: string };

export function ChatModeMenu({
  modes,
  mode,
  onSelect,
}: {
  modes: ModeOption[];
  mode: HouseChatMode;
  onSelect: (id: HouseChatMode) => void;
}) {
  return (
    <Liquid
      blur={8}
      contrast={18}
      fill="hsl(var(--background))"
      shadow="0 10px 28px rgba(0,0,0,0.18)"
      className="absolute bottom-full right-0 z-20 mb-2 flex w-48 flex-col p-1"
    >
      {modes.map((m, i) => (
        <Liquid.Item key={m.id} delay={i * 28} transition="snappy">
          <button
            type="button"
            onClick={() => onSelect(m.id)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs"
            style={{ background: "transparent", color: "hsl(var(--foreground))" }}
          >
            <span>
              <span className="font-semibold">{m.label}</span>
              <span className="ml-1.5 opacity-50">{m.hint}</span>
            </span>
            {mode === m.id && <Check className="h-3.5 w-3.5" style={{ color: "hsl(var(--primary))" }} />}
          </button>
        </Liquid.Item>
      ))}
    </Liquid>
  );
}
