/** Rolling message windows for assistants + OpenDoor Chat allowances. */

import {
  canonicalChatMode,
  isHouseChatBillableMode,
  isHouseChatFreeTasteMode,
} from "./chat-modes.js";

export const PERIOD_WINDOW_MS: Record<string, number> = {
  "15min": 15 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  "4hour": 4 * 60 * 60 * 1000,
  "5hour": 5 * 60 * 60 * 1000,
  "8hour": 8 * 60 * 60 * 1000,
  "12hour": 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export type PeriodWindowId = keyof typeof PERIOD_WINDOW_MS;

export function getWindowMs(window: string | null | undefined): number | null {
  if (!window) return null;
  return PERIOD_WINDOW_MS[window] ?? null;
}

export function isWindowExpired(startedAt: Date | string | null | undefined, windowMs: number): boolean {
  if (!startedAt || !windowMs || windowMs <= 0) return true;
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return true;
  return Date.now() - started >= windowMs;
}

export function getMinutesRemaining(
  startedAt: Date | string | null | undefined,
  windowMs: number
): number | null {
  if (!startedAt || !windowMs || windowMs <= 0) return null;
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return null;
  const remaining = windowMs - (Date.now() - started);
  return remaining > 0 ? Math.ceil(remaining / (60 * 1000)) : 0;
}

export function formatPeriodWindow(window: string | null | undefined): string {
  switch (window) {
    case "15min":
      return "15m";
    case "hourly":
      return "1h";
    case "4hour":
      return "4h";
    case "5hour":
      return "5h";
    case "8hour":
      return "8h";
    case "12hour":
      return "12h";
    case "daily":
      return "24h";
    case "weekly":
      return "week";
    default:
      return window || "";
  }
}

export type HouseChatMode = "auto" | "thinking" | "fast" | "flash" | "max" | "max_fast";

export function normalizeHouseChatMode(raw: unknown): HouseChatMode {
  const m = typeof raw === "string" ? raw.toLowerCase() : "";
  if (
    m === "thinking" ||
    m === "fast" ||
    m === "flash" ||
    m === "max" ||
    m === "max_fast" ||
    m === "auto"
  ) {
    return m;
  }
  return "auto";
}

/** Vertex MaaS Qwen 3 Next — Fast/Auto use Instruct, Thinking/MAX use Thinking. */
export const HOUSE_CHAT_MODEL_ID = "qwen3-next-80b-instruct";
export const HOUSE_CHAT_THINKING_MODEL_ID = "qwen3-next-80b-thinking";
export const HOUSE_CHAT_MAX_THINKING_BUDGET = 8192;

/** DashScope 3.8 Max — not used for house chat (self-host is too expensive). */
export const QWEN38_MAX_ID = "qwen3.8-max";
export const QWEN38_REG_ID = "qwen3.8-27b";
export const QWEN38_FP8_ID = "qwen3.8-27b-fp8";
export const QWEN38_LIGHT_ID = "qwen3.8-27b-awq";

export const QWEN38_REPOS = {
  max: "Qwen/Qwen3.8-2.4T-A95B",
  maxFp8: "Qwen/Qwen3.8-2.4T-A95B-FP8",
  regular: "Qwen/Qwen3.8-27B",
  fp8: "Qwen/Qwen3.8-27B-FP8",
  light: "barrydeen/Qwen3.8-27B-AWQ-4bit",
} as const;

export function houseChatModelForMode(mode?: HouseChatMode | string | null): string {
  switch (canonicalChatMode(mode)) {
    case "thinking":
    case "max":
    case "max_fast":
      return HOUSE_CHAT_THINKING_MODEL_ID;
    default:
      return HOUSE_CHAT_MODEL_ID;
  }
}

export type HouseChatAllowance = {
  periodWindow: PeriodWindowId;
  periodMessageLimit: number;
  weeklyMessageLimit: number;
  pooled: boolean;
};

export function houseChatWindowPooled(plan: string | null | undefined): boolean {
  const p = (plan || "free").toLowerCase();
  return p === "family" || p === "family_max";
}

/** Plan → refresh window + message caps for first-party OpenDoor Chat. */
export function houseChatAllowanceForPlan(plan: string | null | undefined): HouseChatAllowance {
  const p = (plan || "free").toLowerCase();
  const pooled = houseChatWindowPooled(p);
  if (p === "enterprise") {
    return { periodWindow: "12hour", periodMessageLimit: 120, weeklyMessageLimit: 400, pooled: false };
  }
  if (p === "family_max") {
    return { periodWindow: "5hour", periodMessageLimit: 225, weeklyMessageLimit: 675, pooled };
  }
  if (p === "family") {
    return { periodWindow: "5hour", periodMessageLimit: 100, weeklyMessageLimit: 300, pooled };
  }
  if (p === "team") {
    return { periodWindow: "5hour", periodMessageLimit: 80, weeklyMessageLimit: 250, pooled: false };
  }
  if (p === "ultra") {
    return { periodWindow: "5hour", periodMessageLimit: 100, weeklyMessageLimit: 300, pooled: false };
  }
  if (p === "pro") {
    return { periodWindow: "5hour", periodMessageLimit: 45, weeklyMessageLimit: 135, pooled: false };
  }
  if (p === "student") {
    return { periodWindow: "5hour", periodMessageLimit: 20, weeklyMessageLimit: 60, pooled: false };
  }
  return { periodWindow: "5hour", periodMessageLimit: 15, weeklyMessageLimit: 40, pooled: false };
}

export function houseChatModeToThinking(mode: HouseChatMode | string | null | undefined): {
  enable_thinking?: boolean;
  thinking_budget?: number;
} {
  switch (canonicalChatMode(mode)) {
    case "flash":
      return { enable_thinking: false };
    case "thinking":
      return { enable_thinking: true };
    case "max":
    case "max_fast":
      return { enable_thinking: true, thinking_budget: HOUSE_CHAT_MAX_THINKING_BUDGET };
    case "auto":
    default:
      return {};
  }
}

export type ChatRateLimitSnapshot = {
  windowStartTime: Date;
  windowExpiresAt: Date;
  messageCount: number;
};

/**
 * Claude-style rolling 5h window. Expired / missing windows start now.
 * Over cap does not increment.
 */
export function applyFiveHourWindow(
  existing: ChatRateLimitSnapshot | null,
  cap: number,
  now = new Date(),
  windowMs = PERIOD_WINDOW_MS["5hour"]
): {
  allowed: boolean;
  next: ChatRateLimitSnapshot;
  retryAfterSeconds: number;
  reset: boolean;
} {
  const expired =
    !existing ||
    now.getTime() >= existing.windowExpiresAt.getTime() ||
    isWindowExpired(existing.windowStartTime, windowMs);

  if (expired) {
    return {
      allowed: cap > 0,
      reset: true,
      retryAfterSeconds: 0,
      next: {
        windowStartTime: now,
        windowExpiresAt: new Date(now.getTime() + windowMs),
        messageCount: cap > 0 ? 1 : 0,
      },
    };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.windowExpiresAt.getTime() - now.getTime()) / 1000)
  );

  if (existing.messageCount >= cap) {
    return {
      allowed: false,
      reset: false,
      retryAfterSeconds,
      next: existing,
    };
  }

  return {
    allowed: true,
    reset: false,
    retryAfterSeconds: 0,
    next: {
      ...existing,
      messageCount: existing.messageCount + 1,
    },
  };
}

export const HOUSE_CHAT_CHILD_SAFETY_PROMPT = `You are OpenDoor Chat in child-protected mode. Keep every reply age-appropriate for children under 13.
Refuse adult, sexual, pornographic, graphic violence, self-harm, or illegal activity requests. Do not provide instructions for weapons, drugs, or bypassing parental controls.
If a request is inappropriate, briefly refuse and offer a safe alternative topic. Be kind, clear, and helpful.`;

export function formatAllowanceCountdown(minutesRemaining: number | null | undefined): string {
  if (minutesRemaining == null || minutesRemaining <= 0) return "now";
  if (minutesRemaining < 60) return `${minutesRemaining}m`;
  const h = Math.floor(minutesRemaining / 60);
  const m = minutesRemaining % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export { isHouseChatBillableMode, isHouseChatFreeTasteMode, canonicalChatMode };
