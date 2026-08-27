"use client";

import { useEffect, useState } from "react";
import GridLoader from "@/components/smoothui/grid-loader";
import {
  AI_CREST_NAME,
  getCrestPresentation,
  type CrestMood,
  type CrestSurface,
} from "@/lib/ai-crest";
import { cn } from "@/lib/utils";

export { AI_CREST_NAME };

export function AiCrest({
  mood = "idle",
  surface = "public",
  size = "md",
  color,
  className,
}: {
  mood?: CrestMood;
  surface?: CrestSurface;
  size?: "sm" | "md" | "lg" | "xl" | number;
  color?: string;
  className?: string;
}) {
  const presentation = getCrestPresentation(mood, surface);
  const dark = useIsDark();
  const fill =
    color ||
    (dark && presentation.colorDark ? presentation.colorDark : presentation.color);

  return (
    <GridLoader
      pattern={presentation.pattern}
      color={fill}
      size={size}
      glowIntensity={presentation.glowIntensity}
      animationDuration={presentation.animationDuration}
      delayMultiplier={presentation.delayMultiplier}
      staticMode={presentation.staticMode}
      label={presentation.label}
      className={className}
    />
  );
}

/** Lucide-shaped wrapper so the Agents nav item can use the crest. */
export function AgentsNavIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn("inline-flex h-4 w-4 items-center justify-center", className)}
      style={style}
    >
      <AiCrest mood="ready" size={16} color="currentColor" />
    </span>
  );
}

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
