"use client";

import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** The grid pattern is based on the Ochieng and Co logo. */
export type GridMatrix = Array<Array<0 | 1>>;

export type CrestPatternName =
  | "plus-full"
  | "sparkle"
  | "diamond"
  | "x-shape"
  | "frame"
  | "spiral-cw";

export interface GridLoaderProps {
  pattern?: CrestPatternName | GridMatrix;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl" | number;
  glowIntensity?: number;
  animationDuration?: number;
  delayMultiplier?: number;
  staticMode?: boolean;
  className?: string;
  label?: string;
}

const PLUS_FULL: GridMatrix = [
  [0, 1, 0],
  [1, 1, 1],
  [1, 1, 1],
  [0, 1, 0],
];

const PATTERNS: Record<CrestPatternName, GridMatrix> = {
  "plus-full": PLUS_FULL,
  sparkle: PLUS_FULL,
  diamond: PLUS_FULL,
  "x-shape": [
    [1, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
    [1, 0, 1],
  ],
  frame: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  "spiral-cw": [
    [1, 1, 1],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
};

const SIZES: Record<string, number> = {
  sm: 20,
  md: 32,
  lg: 48,
  xl: 64,
};

const INACTIVE = "rgba(255, 255, 255, 0.08)";
const COLS = 3;
const ROWS = 4;
const GAP_RATIO = 0.4;

function resolvePattern(pattern: CrestPatternName | GridMatrix | undefined): GridMatrix {
  if (!pattern) return PATTERNS["plus-full"];
  if (typeof pattern === "string") return PATTERNS[pattern] ?? PATTERNS["plus-full"];
  return pattern;
}

function resolveSize(size: GridLoaderProps["size"]): number {
  if (size === undefined) return SIZES.md;
  if (typeof size === "number") return size;
  return SIZES[size] ?? SIZES.md;
}

function cellDelay(row: number, col: number, delayMultiplier: number) {
  return (((Math.abs(row) + Math.abs(col)) * 0.15) % 1.2) * delayMultiplier;
}

export default function GridLoader({
  pattern = "plus-full",
  color,
  size = "md",
  glowIntensity = 0,
  animationDuration = 2.4,
  delayMultiplier = 1,
  staticMode = false,
  className,
  label = "Ai-crest",
}: GridLoaderProps) {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = !staticMode && !prefersReducedMotion;
  const sizeInPx = resolveSize(size);
  const cellSize = sizeInPx / (COLS + (COLS - 1) * GAP_RATIO);
  const gap = cellSize * GAP_RATIO;
  const pad = (cellSize * (Math.SQRT2 - 1)) / 2;
  const grid = resolvePattern(pattern);
  const fill = color || "currentColor";
  const glowPx = cellSize * 0.5 * glowIntensity;

  return (
    <output
      data-grid-loader=""
      data-reduced={shouldAnimate ? undefined : "true"}
      role="status"
      aria-label={label}
      className={cn(
        "inline-grid shrink-0 place-items-center",
        !color && "text-black dark:text-white",
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${ROWS}, ${cellSize}px)`,
        gap,
        padding: pad,
        width: 3 * cellSize + 2 * gap + 2 * pad,
        height: 4 * cellSize + 3 * gap + 2 * pad,
      }}
    >
      {grid.flatMap((row, r) =>
        row.map((active, c) => {
          const lit = active === 1;
          return (
            <span
              key={`${r}-${c}`}
              aria-hidden
              className="block"
              style={{
                width: cellSize,
                height: cellSize,
                borderRadius: 0,
                backgroundColor: lit ? fill : INACTIVE,
                transform: "rotateZ(45deg)",
                boxShadow: lit && glowIntensity > 0 ? `0 0 ${glowPx}px ${fill}` : undefined,
                animation:
                  shouldAnimate && lit
                    ? `chess-move ${animationDuration}s ease-in-out ${cellDelay(r, c, delayMultiplier)}s infinite`
                    : undefined,
                opacity: shouldAnimate && lit ? undefined : 1,
              }}
            />
          );
        }),
      )}
    </output>
  );
}

export { PATTERNS, SIZES };
