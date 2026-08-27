export type AvatarVisual = "working" | "needs-you" | "error" | "idle";

const WORKING = new Set([
  "running",
  "starting",
  "pending",
  "working",
  "thinking",
  "streaming",
]);

const NEEDS_YOU = new Set([
  "help_requested",
  "waiting",
  "needs_you",
  "needs-you",
  "awaiting_input",
  "approval",
]);

const ERROR = new Set(["failed", "error"]);

export function avatarVisual(input: {
  status?: string | null;
  computerStatus?: string | null;
}): AvatarVisual {
  const status = (input.status || "").trim().toLowerCase();
  const computer = (input.computerStatus || "").trim().toLowerCase();

  if (NEEDS_YOU.has(computer) || NEEDS_YOU.has(status)) return "needs-you";
  if (ERROR.has(status)) return "error";
  if (computer === "human_driving") return "idle";
  if (WORKING.has(status)) return "working";
  return "idle";
}

export function avatarVisualLabel(visual: AvatarVisual) {
  if (visual === "needs-you") return "needs you";
  return visual;
}
