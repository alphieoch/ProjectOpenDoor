import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Static crest mark for the sidebar — avoids pulling GridLoader onto every dashboard route. */
export function AgentsNavIcon({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 12 16"
      className={cn("h-4 w-4", className)}
      style={style}
      aria-hidden
    >
      <circle cx="6" cy="2" r="1.35" fill="currentColor" />
      <circle cx="2" cy="6" r="1.35" fill="currentColor" />
      <circle cx="6" cy="6" r="1.35" fill="currentColor" />
      <circle cx="10" cy="6" r="1.35" fill="currentColor" />
      <circle cx="2" cy="10" r="1.35" fill="currentColor" />
      <circle cx="6" cy="10" r="1.35" fill="currentColor" />
      <circle cx="10" cy="10" r="1.35" fill="currentColor" />
      <circle cx="6" cy="14" r="1.35" fill="currentColor" />
    </svg>
  );
}
