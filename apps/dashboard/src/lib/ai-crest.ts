import type { CrestPatternName } from "@/components/smoothui/grid-loader";

export const AI_CREST_NAME = "Ai-crest";

export type CrestMood =
  | "idle"
  | "ready"
  | "thinking"
  | "searching"
  | "generating"
  | "acting"
  | "awaiting"
  | "error";

export type CrestSurface = "public" | "agent";

export type CrestPresentation = {
  pattern: CrestPatternName;
  color?: string;
  colorDark?: string;
  glowIntensity: number;
  animationDuration: number;
  delayMultiplier: number;
  staticMode: boolean;
  label: string;
};

const INK = undefined;

export function getCrestPresentation(
  mood: CrestMood,
  surface: CrestSurface = "public",
): CrestPresentation {
  const name = (label: string) => `${AI_CREST_NAME}: ${label}`;

  if (mood === "error") {
    return {
      pattern: "x-shape",
      color: "#ff6b6b",
      glowIntensity: 0.55,
      animationDuration: surface === "agent" ? 1.35 : 1.4,
      delayMultiplier: 0.85,
      staticMode: false,
      label: name("Error"),
    };
  }

  if (mood === "ready") {
    return {
      pattern: "plus-full",
      color: INK,
      glowIntensity: 0,
      animationDuration: 2.4,
      delayMultiplier: 1,
      staticMode: true,
      label: name("Ready"),
    };
  }

  if (mood === "idle") {
    return {
      pattern: "plus-full",
      color: INK,
      glowIntensity: 0,
      animationDuration: surface === "agent" ? 2.6 : 2.4,
      delayMultiplier: 1,
      staticMode: false,
      label: name("Idle"),
    };
  }

  if (surface === "agent") {
    if (mood === "searching") {
      return {
        pattern: "spiral-cw",
        color: "#4ade80",
        glowIntensity: 0.45,
        animationDuration: 1.35,
        delayMultiplier: 0.8,
        staticMode: false,
        label: name("Searching"),
      };
    }
    if (mood === "acting") {
      return {
        pattern: "diamond",
        color: "#fbbf24",
        glowIntensity: 0.4,
        animationDuration: 1.45,
        delayMultiplier: 0.85,
        staticMode: false,
        label: name("Acting"),
      };
    }
    if (mood === "awaiting") {
      return {
        pattern: "frame",
        color: "#fbbf24",
        glowIntensity: 0.25,
        animationDuration: 2.2,
        delayMultiplier: 1.1,
        staticMode: false,
        label: name("Awaiting"),
      };
    }
    return {
      pattern: "sparkle",
      color: "#3b82f6",
      colorDark: "#38bdf8",
      glowIntensity: 0.4,
      animationDuration: 1.55,
      delayMultiplier: 0.9,
      staticMode: false,
      label: name("Thinking"),
    };
  }

  if (mood === "searching") {
    return {
      pattern: "plus-full",
      color: "#60a5fa",
      glowIntensity: 1,
      animationDuration: 1.8,
      delayMultiplier: 0.85,
      staticMode: false,
      label: name("Searching"),
    };
  }

  if (mood === "thinking" || mood === "generating") {
    return {
      pattern: "plus-full",
      color: "#4ade80",
      glowIntensity: 1,
      animationDuration: 2,
      delayMultiplier: 0.9,
      staticMode: false,
      label: name("Generating"),
    };
  }

  return {
    pattern: "plus-full",
    color: INK,
    glowIntensity: 0,
    animationDuration: 2.4,
    delayMultiplier: 1,
    staticMode: false,
    label: name("Idle"),
  };
}

export function orbStateToMood(state?: string | null): CrestMood {
  switch (state) {
    case "searching":
      return "searching";
    case "weaving":
      return "acting";
    case "breathing":
    case "listening":
      return "idle";
    case "connecting":
      return "awaiting";
    default:
      return "thinking";
  }
}
