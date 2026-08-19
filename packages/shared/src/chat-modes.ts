export const DEFAULT_ALLOWED_CHAT_MODES = [
  "flash",
  "auto",
  "thinking",
  "max",
  "max_fast",
] as const;

export type AllowedChatMode = (typeof DEFAULT_ALLOWED_CHAT_MODES)[number];

export function canonicalChatMode(mode: string | null | undefined): AllowedChatMode | "unknown" {
  const m = (mode || "").toLowerCase();
  if (m === "fast" || m === "flash") return "flash";
  if (m === "auto" || m === "thinking" || m === "max" || m === "max_fast") return m;
  return "unknown";
}

export function chatModeAllowed(
  allowed: readonly string[] | null | undefined,
  mode: string | null | undefined
): boolean {
  const canonical = canonicalChatMode(mode);
  if (canonical === "unknown") return false;
  const list = (allowed && allowed.length > 0 ? allowed : DEFAULT_ALLOWED_CHAT_MODES).map((m) =>
    canonicalChatMode(m)
  );
  return list.includes(canonical);
}

export function isHouseChatFreeTasteMode(mode: string | null | undefined): boolean {
  const canonical = canonicalChatMode(mode);
  return canonical === "flash" || canonical === "auto";
}

export function isHouseChatBillableMode(mode: string | null | undefined): boolean {
  const canonical = canonicalChatMode(mode);
  return canonical === "thinking" || canonical === "max" || canonical === "max_fast";
}
