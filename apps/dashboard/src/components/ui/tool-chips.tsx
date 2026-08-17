"use client";

import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";

/* ─────────────────────────────────────────────────────────
 * TOOL CHIPS
 * An agent run as compact rows: tool calls with inline
 * chips, then file-diff chips summarizing the edits.
 * Hover a row to reveal its chevron; every row expands
 * to show what the tool actually did.
 * ───────────────────────────────────────────────────────── */

const STEP_MS = 700;

const Icons: Record<string, ReactNode> = {
  think: <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  write: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </g>
  ),
  run: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17l6-5-6-5M12 19h8" />
    </g>
  ),
  read: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </g>
  ),
};

export type ToolDetailLine = { text: string; tone?: "add" };

export type ToolRow = {
  icon: "think" | "write" | "run" | "read" | string;
  label: string;
  chip: string;
  mono?: boolean;
  detailMono?: boolean;
  detail: ToolDetailLine[];
};

export type ToolDiff = {
  file: string;
  add: number;
  del: number;
};

export type DiffLine = { text: string; tone: "add" | "del" | "ctx" };

const DEFAULT_ROWS: ToolRow[] = [
  {
    icon: "think",
    label: "Thinking",
    chip: "Planning the churn schedule…",
    mono: false,
    detailMono: false,
    detail: [
      { text: "Weekend demand carries pistachio, so it churns first." },
      { text: "Batch capacity leaves two evening freezer windows." },
    ],
  },
  {
    icon: "write",
    label: "Write 204 lines",
    chip: "ChurnSchedule.tsx",
    mono: true,
    detailMono: true,
    detail: [
      { text: "+ const windows = slots.filter((s) => s.temp <= -12)", tone: "add" },
      { text: "+ return schedule(windows, { hero: \"pistachio\" })", tone: "add" },
    ],
  },
  {
    icon: "run",
    label: "Rebuild and verify",
    chip: "npm run freeze",
    mono: true,
    detailMono: true,
    detail: [
      { text: "✓ built in 1.2s" },
      { text: "✓ 34 checks passed" },
    ],
  },
  {
    icon: "read",
    label: "Read image",
    chip: "flavor-chart.png",
    mono: true,
    detailMono: false,
    detail: [
      { text: "1280 × 720 · line chart, three summers." },
      { text: "Mint chip trends up 12% through July." },
    ],
  },
];

const DEFAULT_DIFFS: ToolDiff[] = [
  { file: "flavors.css", add: 13, del: 0 },
  { file: "ChurnSchedule.tsx", add: 74, del: 41 },
  { file: "menu.ts", add: 8, del: 2 },
];

const DEFAULT_DIFF_LINES: Record<string, DiffLine[]> = {
  "flavors.css": [
    { text: ".scoop-card {", tone: "ctx" },
    { text: "  gap: 14px;", tone: "del" },
    { text: "  gap: 12px;", tone: "add" },
    { text: "  container-type: inline-size;", tone: "add" },
    { text: "}", tone: "ctx" },
  ],
  "ChurnSchedule.tsx": [
    { text: "const slots = coldSlots(week);", tone: "ctx" },
    { text: "const windows = slots;", tone: "del" },
    { text: "const windows = slots.filter(", tone: "add" },
    { text: "  (s) => s.temp <= -12,", tone: "add" },
    { text: ");", tone: "add" },
  ],
  "menu.ts": [
    { text: "export const hero = \"mint-chip\";", tone: "del" },
    { text: "export const hero = \"pistachio\";", tone: "add" },
  ],
};

export type ToolChipsProps = {
  rows?: ToolRow[];
  diffs?: ToolDiff[];
  diffLines?: Record<string, DiffLine[]>;
  summaryText?: string;
  autoPlay?: boolean;
  className?: string;
};

export default function ToolChips({
  rows = DEFAULT_ROWS,
  diffs = DEFAULT_DIFFS,
  diffLines = DEFAULT_DIFF_LINES,
  summaryText,
  autoPlay = true,
  className,
}: ToolChipsProps) {
  const total = rows.length + 1; // rows, then diff chips
  const [step, setStep] = useState(autoPlay ? 0 : total);
  const [open, setOpen] = useState(true);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  /* Rendered in a body portal so animated/translated reply wrappers cannot
   * redefine the fixed-position coordinate system. */
  const [preview, setPreview] = useState<{
    file: string;
    x: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const openPreview = (file: string) => (event: SyntheticEvent) => {
    if (typeof window === "undefined") return;
    const target = (event.currentTarget as Element).closest("[data-diffchip]");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const previewHeight = 38 + (diffLines[file]?.length ?? 0) * 19;
    const fitsBelow = rect.bottom + 6 + previewHeight <= window.innerHeight - 12;
    setPreview({
      file,
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
      ...(fitsBelow
        ? { top: rect.bottom + 6 }
        : { bottom: window.innerHeight - rect.top + 6 }),
    });
  };

  const closePreview = (file: string) => () =>
    setPreview((current) => (current?.file === file ? null : current));

  useEffect(() => {
    if (!autoPlay || step >= total) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, total, autoPlay]);

  const toggleRow = (label: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });

  const activeSummary = summaryText || `${rows.length} tool calls, ${diffs.length} files modified`;

  return (
    <div className={`min-h-[220px] w-full max-w-sm pb-1 ${className || ""}`}>
      {/* collapsed run header */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] transition-colors duration-100 hover:bg-[var(--paper-3)]"
        style={{ color: "var(--ink-2)" }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="tabular-nums font-medium">{activeSummary}</span>
      </button>

      {/* tool call rows */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="-mx-1 overflow-hidden px-1.5 pb-1">
          <div className="mt-1.5 flex flex-col gap-1">
            {rows.slice(0, step).map((row) => {
              const rowOpen = openRows.has(row.label);
              return (
                <div key={row.label} style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
                  <button
                    type="button"
                    aria-expanded={rowOpen}
                    onClick={() => toggleRow(row.label)}
                    className="group/row -mx-[3px] flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 rounded-lg px-[3px] text-left transition-colors duration-100 hover:bg-[var(--paper-3)]"
                  >
                    <span className="relative flex size-4 shrink-0 items-center justify-center" style={{ color: "var(--ink-3)" }}>
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill={row.icon === "think" ? "currentColor" : "none"}
                        stroke="currentColor"
                        className={`transition-opacity duration-100 group-hover/row:opacity-0 ${rowOpen ? "opacity-0" : ""}`}
                      >
                        {Icons[row.icon] || Icons.think}
                      </svg>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`absolute transition-[opacity,transform] duration-150 group-hover/row:opacity-100 ${
                          rowOpen ? "opacity-100" : "opacity-0"
                        }`}
                        style={{ transform: rowOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-medium" style={{ color: "var(--ink)" }}>
                      {row.label}
                    </span>
                    <span
                      className={`inline-flex h-5.5 min-w-0 flex-1 cursor-pointer items-center truncate rounded-md px-1.5 text-[11.5px] shadow-sm transition-colors duration-100 hover:bg-[var(--paper-3)] ${
                        row.mono ? "font-mono" : ""
                      }`}
                      style={{
                        background: "var(--paper-2)",
                        color: "var(--ink-2)",
                        border: "1px solid var(--line)",
                      }}
                    >
                      {row.chip}
                    </span>
                  </button>

                  {/* expanded detail */}
                  <div
                    className="grid transition-[grid-template-rows,opacity] duration-300"
                    style={{
                      gridTemplateRows: rowOpen ? "1fr" : "0fr",
                      opacity: rowOpen ? 1 : 0,
                      transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
                    }}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div
                        className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l py-0.5 pl-3.5"
                        style={{ borderColor: "var(--line)" }}
                      >
                        {row.detail.map((line, idx) => (
                          <span
                            key={idx}
                            className={`truncate text-[11.5px] leading-[1.6] ${row.detailMono ? "font-mono" : ""} ${
                              line.tone === "add" ? "text-emerald-500" : ""
                            }`}
                            style={{ color: line.tone === "add" ? undefined : "var(--ink-3)" }}
                          >
                            {line.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* file-diff chips */}
          {step >= total && (
            <div className="mt-2.5 flex max-w-full flex-wrap gap-1.5 border-t pt-2.5" style={{ borderColor: "var(--line)" }}>
              {diffs.map((d, i) => (
                <span
                  key={d.file}
                  data-diffchip
                  className="relative"
                  onMouseEnter={openPreview(d.file)}
                  onMouseLeave={closePreview(d.file)}
                >
                  <button
                    type="button"
                    aria-expanded={preview?.file === d.file}
                    aria-label={`Show diff for ${d.file}`}
                    onFocus={openPreview(d.file)}
                    onBlur={closePreview(d.file)}
                    className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md px-2 font-mono text-[11.5px] shadow-sm transition-colors duration-100 hover:bg-[var(--paper-3)] border"
                    style={{
                      background: "var(--paper-2)",
                      borderColor: "var(--line)",
                      color: "var(--ink)",
                      animation: `pop-in 250ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
                    }}
                  >
                    <span className="min-w-0 truncate">{d.file}</span>
                    <span className="shrink-0 text-emerald-500 tabular-nums">+{d.add}</span>
                    {d.del > 0 && <span className="shrink-0 text-rose-500 tabular-nums">−{d.del}</span>}
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="inline-flex h-7 items-center rounded-md px-1.5 font-mono text-[11.5px] underline decoration-transparent underline-offset-2 transition-colors duration-100 hover:decoration-current"
                style={{
                  color: "var(--ink-3)",
                  animation: `fade-in 300ms ease-out ${diffs.length * 80}ms both`,
                }}
              >
                +2 more
              </button>
            </div>
          )}
        </div>
      </div>

      {preview &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-50 w-72 overflow-hidden rounded-xl border shadow-2xl"
            style={{
              left: preview.x,
              top: preview.top,
              bottom: preview.bottom,
              background: "var(--paper-2)",
              borderColor: "var(--line)",
              animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
              transformOrigin: preview.top === undefined ? "bottom left" : "top left",
            }}
          >
            <div
              className="flex items-center justify-between border-b px-2.5 py-1.5 font-mono text-[11px]"
              style={{ borderColor: "var(--line)" }}
            >
              <span className="min-w-0 truncate font-semibold" style={{ color: "var(--ink)" }}>{preview.file}</span>
              <span className="shrink-0 tabular-nums">
                <span className="text-emerald-500">+{diffs.find((diff) => diff.file === preview.file)?.add}</span>
                {(diffs.find((diff) => diff.file === preview.file)?.del ?? 0) > 0 && (
                  <span className="text-rose-500"> −{diffs.find((diff) => diff.file === preview.file)?.del}</span>
                )}
              </span>
            </div>
            <div className="py-1 font-mono text-[11px] leading-[1.8]">
              {(diffLines[preview.file] ?? []).map((line, index) => (
                <div
                  key={index}
                  className={`flex gap-2 px-2.5 whitespace-pre ${
                    line.tone === "add"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : line.tone === "del"
                        ? "bg-rose-500/10 text-rose-500"
                        : ""
                  }`}
                  style={{ color: line.tone === "add" || line.tone === "del" ? undefined : "var(--ink-2)" }}
                >
                  <span className="w-3 shrink-0 select-none font-bold">
                    {line.tone === "add" ? "+" : line.tone === "del" ? "−" : " "}
                  </span>
                  <span className="min-w-0 truncate">{line.text}</span>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
