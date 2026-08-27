import { ALLOWED_AUTH_ORIGINS, isAllowedAuthOrigin } from "@/lib/public-urls";

const FALLBACK_PATH = "/dashboard";

function looksLikeAuthKitObject(value: unknown) {
  if (value == null) return false;
  if (typeof value === "object") return true;
  const text = String(value);
  return text.includes("[object Object]") || text === "[object Object]";
}

/**
 * Same-origin app path only. Rejects protocol-relative, absolute, and
 * AuthKit `{ url }` objects so we never bounce users to `/[object Object]`
 * or `https://evil.example`.
 */
export function safeAppPath(value: unknown, fallback = FALLBACK_PATH): string {
  if (looksLikeAuthKitObject(value) && typeof value !== "string") return fallback;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || looksLikeAuthKitObject(trimmed)) return fallback;
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return fallback;
  if (trimmed.includes("://") || trimmed.includes("\\")) return fallback;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || /[\x00-\x1f]/.test(decoded)) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return fallback;
  try {
    const resolved = new URL(trimmed, "https://opendoor.invalid");
    if (resolved.origin !== "https://opendoor.invalid") return fallback;
    if (resolved.username || resolved.password) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export function safeReturnUrl(
  value: unknown,
  allowedOrigins: readonly string[] = ALLOWED_AUTH_ORIGINS,
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (url.protocol === "http:" && !/^localhost$|^127\.0\.0\.1$/.test(url.hostname)) {
      return null;
    }
    const allowed = allowedOrigins.some((origin) => {
      try {
        return new URL(origin).origin === url.origin;
      } catch {
        return false;
      }
    });
    if (!allowed && !isAllowedAuthOrigin(url.origin)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
