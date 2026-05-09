"use client";

import { useEffect, useRef, useState } from "react";

const SIZE = 4;
const GAP = 2;
const TOTAL_DOTS = SIZE * SIZE;

const PATTERNS = [
  [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4, 5, 6, 10, 9],
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
  [5, 6, 9, 10],
  [1, 4, 7, 8, 11, 14],
  [0, 3, 12, 15],
  [1, 4, 7, 8, 11, 14],
  [5, 6, 9, 10],
  [0],
  [1, 4],
  [2, 5, 8],
  [3, 6, 9, 12],
  [7, 10, 13],
  [11, 14],
  [15],
];

export function ChatIndicator() {
  const [activeDots, setActiveDots] = useState<Set<number>>(new Set());
  const patternIndexRef = useRef(0);
  const stepIndexRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const pattern = PATTERNS[patternIndexRef.current];
      if (!pattern) return;

      setActiveDots(new Set([pattern[stepIndexRef.current] ?? 0]));
      stepIndexRef.current++;

      if (stepIndexRef.current >= pattern.length) {
        stepIndexRef.current = 0;
        patternIndexRef.current = (patternIndexRef.current + 1) % PATTERNS.length;
      }
    }, 120);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="shrink-0 grid"
      style={{
        gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
        gap: `${GAP}px`,
        width: `${SIZE * 4 + (SIZE - 1) * GAP}px`,
        height: `${SIZE * 4 + (SIZE - 1) * GAP}px`,
      }}
    >
      {Array.from({ length: TOTAL_DOTS }, (_, i) => (
        <span
          key={i}
          className="rounded-sm transition-opacity duration-100"
          style={{
            backgroundColor: "currentColor",
            opacity: activeDots.has(i) ? 1 : 0.2,
            width: "4px",
            height: "4px",
          }}
        />
      ))}
    </div>
  );
}
