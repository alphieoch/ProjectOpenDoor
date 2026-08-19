"use client";

import { AiCrest } from "@/components/ui/ai-crest";
import { OchiengLogoSimple } from "@/components/logos/OchiengLogoSimple";
import type { CrestMood, CrestSurface } from "@/lib/ai-crest";

const ROWS: Array<{
  title: string;
  note: string;
  mood: CrestMood;
  surface: CrestSurface;
  size: number;
}> = [
  { title: "Idle", note: "Welcome / no thread · 2.4s breathe", mood: "idle", surface: "public", size: 45 },
  { title: "Ready", note: "Thread settled · pulse off", mood: "ready", surface: "public", size: 45 },
  { title: "Generating", note: "Public chat thinking · green glow", mood: "thinking", surface: "public", size: 45 },
  { title: "Searching", note: "Web search · blue", mood: "searching", surface: "public", size: 45 },
  { title: "Agent thinking", note: "My Agent · blue / sky", mood: "thinking", surface: "agent", size: 45 },
  { title: "Agent searching", note: "spiral-cw · green", mood: "searching", surface: "agent", size: 45 },
  { title: "Error", note: "x-shape · red", mood: "error", surface: "public", size: 45 },
  { title: "Rail / pill", note: "22px header · 16px dock", mood: "idle", surface: "public", size: 22 },
];

export default function CrestDemoPage() {
  return (
    <main className="min-h-dvh bg-[var(--paper)] px-6 py-12 text-[var(--ink)]">
      <div className="mx-auto max-w-3xl">
        <p className="od-eyebrow">Ai-crest</p>
        <h1 className="page-title mt-2">Ochieng chevron</h1>
        <p className="page-desc mt-2 max-w-xl">
          Parent mark has the bar. The AI face is the same plus without it. Pulse is CSS chess-move — the diamonds stay at 45°.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <figure className="od-card flex flex-col items-center gap-3 p-8">
            <OchiengLogoSimple size={64} />
            <figcaption className="text-center">
              <p className="text-sm font-medium">Parent chevron</p>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>Eight squares + vertical bar</p>
            </figcaption>
          </figure>
          <figure className="od-card flex flex-col items-center gap-3 p-8">
            <AiCrest mood="idle" size={64} />
            <figcaption className="text-center">
              <p className="text-sm font-medium">AI crest</p>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>Same plus, no bar</p>
            </figcaption>
          </figure>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {ROWS.map((row) => (
            <div key={`${row.title}-${row.surface}`} className="od-card flex items-center gap-4 p-5">
              <AiCrest mood={row.mood} surface={row.surface} size={row.size} />
              <div>
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>{row.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
