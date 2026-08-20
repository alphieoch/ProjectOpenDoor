"use client";

import Avatar from "boring-avatars";
import { cn } from "@/lib/utils";
import { avatarVisual, avatarVisualLabel, type AvatarVisual } from "./avatar-status";
import { marbleDrift } from "./marble-drift";

function StatusRing({ visual, size }: { visual: AvatarVisual; size: number }) {
  if (visual === "idle") return null;

  if (visual === "working") {
    const stroke = Math.max(1.25, size * 0.055);
    const inset = stroke / 2 + 0.75;
    const r = size / 2 - inset;
    const circ = 2 * Math.PI * r;
    const arc = circ * 0.22;
    return (
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 text-foreground/70 motion-safe:animate-spin"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circ - arc}`}
        />
      </svg>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 rounded-full ring-[1.5px] ring-inset",
        visual === "needs-you" && "ring-warning motion-safe:animate-pulse",
        visual === "error" && "ring-destructive",
      )}
    />
  );
}

export function GradientAvatar({
  seed,
  name,
  size = 32,
  className = "",
  status,
  computerStatus,
}: {
  seed: string;
  name?: string;
  size?: number;
  className?: string;
  status?: string | null;
  computerStatus?: string | null;
}) {
  const visual = avatarVisual({ status, computerStatus });
  const drift = marbleDrift(seed);
  const face = visual === "idle" ? size : Math.max(16, size - 4);
  const marbleSize = Math.round(face * 2.4);
  const label = name && visual !== "idle" ? `${name}, ${avatarVisualLabel(visual)}` : name;

  return (
    <span
      role={name ? "img" : undefined}
      aria-label={label}
      aria-hidden={name ? undefined : true}
      aria-busy={visual === "working" || undefined}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ height: size, width: size }}
    >
      <span className="relative overflow-hidden rounded-full" style={{ height: face, width: face }}>
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 will-change-transform motion-safe:animate-openbot-marble-drift"
          style={{ animationDelay: `${drift.delay}s`, animationDuration: `${drift.duration}s` }}
        >
          <span aria-hidden="true" className="contents">
            <Avatar name={seed} size={marbleSize} variant="marble" />
          </span>
        </span>
      </span>
      <StatusRing visual={visual} size={size} />
    </span>
  );
}
