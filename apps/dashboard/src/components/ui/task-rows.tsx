"use client";

import { useEffect, useState, type ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * TASK ROWS
 *
 *     0ms   rows enter staggered (80ms apart)
 *   600ms   row 1 ring sweeps 0 → 66%
 *  1500ms   row 1 expands — detail steps drop down
 *  3900ms   row 1 collapses; row 2 flips to Failed + retry
 *  5300ms   row 2 resolves to Completed
 * The status run completes once; task details stay clickable.
 * ───────────────────────────────────────────────────────── */

const TICKS = [600, 900, 2400, 1400, 2400, 600];

function useTick(intervals: number[], active = true) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || tick >= intervals.length - 1) return;
    const t = setTimeout(() => setTick((x) => x + 1), intervals[tick]);
    return () => clearTimeout(t);
  }, [tick, intervals, active]);
  return tick;
}

function SpinnerRing({ active, children }: { active?: boolean; children?: ReactNode }) {
  const size = 24;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        style={active ? { animation: "spin 1.1s linear infinite" } : undefined}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {active && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
        {children}
      </span>
    </span>
  );
}

function Badge({ tone, children }: { tone: "red" | "green"; children: ReactNode }) {
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full text-white ${
        tone === "red" ? "bg-rose-500" : "bg-emerald-500"
      }`}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  );
}

const XIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const CheckIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const RetryIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
  </svg>
);

export type TaskDetail = {
  label: string;
  meta: string;
};

export type TaskItem = {
  key: string;
  label: string;
  amount?: string;
  status?: "pending" | "running" | "failed" | "completed";
  details: TaskDetail[];
};

const DEFAULT_TASKS: TaskItem[] = [
  {
    key: "verify",
    label: "Verified vendor records",
    amount: "12 suppliers",
    status: "completed",
    details: [
      { label: "Matched tax and contact IDs", meta: "12/12" },
      { label: "Flagged stale records", meta: "0" },
    ],
  },
  {
    key: "index",
    label: "Build reorder task list",
    amount: "7 SKUs",
    status: "running",
    details: [
      { label: "Reading POS export", meta: "3 files" },
      { label: "Scoring stockout risk", meta: "68%" },
    ],
  },
  {
    key: "draft",
    label: "Draft supplier emails",
    amount: "2 messages",
    details: [
      { label: "Cone supplier follow-up", meta: "draft" },
      { label: "Pistachio reorder note", meta: "draft" },
    ],
  },
];

export type TaskRowsProps = {
  variant?: "Capsules" | "List" | string;
  tasks?: TaskItem[];
  autoPlay?: boolean;
  className?: string;
};

export default function TaskRows({
  variant = "Capsules",
  tasks = DEFAULT_TASKS,
  autoPlay = true,
  className,
}: TaskRowsProps) {
  const tick = useTick(TICKS, autoPlay);
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const row2State: "pending" | "failed" | "done" = autoPlay
    ? (tick < 3 ? "pending" : tick === 3 ? "failed" : "done")
    : "done";

  const list = variant === "List";

  return (
    <div
      className={`flex w-full max-w-lg flex-col ${
        list
          ? "gap-0 self-start overflow-hidden rounded-2xl border shadow-lg"
          : "min-h-[196px] gap-2.5"
      } ${className || ""}`}
      style={list ? { borderColor: "var(--line)", background: "var(--paper-2)" } : undefined}
    >
      {tasks.map((task, i) => {
        const isSimulatedThird = task.key === "draft";
        const isSimulatedSecond = task.key === "index";
        
        let badge: ReactNode;
        let pill: ReactNode = null;

        if (task.status === "completed" || (!task.status && task.key === "verify")) {
          badge = <Badge tone="green">{CheckIcon}</Badge>;
          pill = (
            <span
              className="inline-flex h-5.5 items-center rounded-full px-2 text-[11.5px] font-medium"
              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            >
              Completed
            </span>
          );
        } else if (isSimulatedSecond && autoPlay) {
          badge = <SpinnerRing active>{i + 1}</SpinnerRing>;
        } else if (isSimulatedThird && autoPlay) {
          if (row2State === "pending") {
            badge = <SpinnerRing>{i + 1}</SpinnerRing>;
          } else if (row2State === "failed") {
            badge = <Badge tone="red">{XIcon}</Badge>;
            pill = (
              <span
                className="inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium"
                style={{
                  background: "var(--red-soft)",
                  color: "var(--red)",
                  animation: "fade-in 200ms ease-out both",
                }}
              >
                Failed{" "}
                <span style={{ animation: "spin 1.2s linear infinite" }} className="flex">
                  {RetryIcon}
                </span>
              </span>
            );
          } else {
            badge = <Badge tone="green">{CheckIcon}</Badge>;
            pill = (
              <span
                className="inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium"
                style={{
                  background: "var(--brand-soft)",
                  color: "var(--brand)",
                  animation: "fade-in 200ms ease-out both",
                }}
              >
                Completed
              </span>
            );
          }
        } else {
          badge = <Badge tone="green">{CheckIcon}</Badge>;
          pill = (
            <span
              className="inline-flex h-5.5 items-center rounded-full px-2 text-[11.5px] font-medium"
              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            >
              Completed
            </span>
          );
        }

        const open = manualOpen[task.key] ?? (autoPlay && task.key === "index" && tick === 2);

        return (
          <div
            key={task.key}
            className={`self-stretch overflow-hidden transition-all duration-300 ${
              list
                ? "border-b last:border-0 hover:bg-[var(--paper-3)]"
                : "rounded-2xl border shadow-md hover:bg-[var(--paper-3)]"
            }`}
            style={{
              borderColor: "var(--line)",
              background: list ? "transparent" : "var(--paper-2)",
              borderRadius: list ? 0 : open ? 16 : 24,
              animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
            }}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setManualOpen((current) => ({ ...current, [task.key]: !open }))}
              className="flex h-11 w-full items-center gap-2.5 px-3 text-left"
            >
              <span className="flex size-6 shrink-0 items-center justify-center">{badge}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {task.label}
              </span>
              {task.amount && (
                <span className="text-[12.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                  {task.amount}
                </span>
              )}
              {pill}
              <span
                aria-hidden="true"
                className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
                style={{ color: "var(--ink-4)" }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-300"
                  style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>

            {/* dropdown detail */}
            <div
              className="grid transition-[grid-template-rows,opacity] duration-300"
              style={{
                gridTemplateRows: open ? "1fr" : "0fr",
                opacity: open ? 1 : 0,
                transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            >
              <div className="overflow-hidden">
                <div className="mb-3 grid grid-cols-[24px_1fr] gap-2.5 px-3">
                  <span aria-hidden className="mx-auto h-full w-px" style={{ background: "var(--line)" }} />
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    {task.details.map((d, j) => (
                      <div
                        key={d.label}
                        className="flex items-center justify-between"
                        style={
                          open
                            ? {
                                animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${
                                  120 + j * 100
                                }ms both`,
                              }
                            : undefined
                        }
                      >
                        <span className="text-[12px]" style={{ color: "var(--ink-2)" }}>
                          {d.label}
                        </span>
                        <span className="font-mono text-[11.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                          {d.meta}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
