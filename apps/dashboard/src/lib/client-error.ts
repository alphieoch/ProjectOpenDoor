const INTERNAL =
  /stack|ECONNREFUSED|ECONNRESET|postgres|redis:\/\/|INTERNAL_API|GATEWAY_INTERNAL|SECRET|password|localhost:\d+|127\.0\.0\.1|0\.0\.0\.0|OPENBOT_|SUPERVISOR|AUTH_SECRET|STRIPE_SECRET|at \w+ \(/i;

const SAFE_EXACT = new Set([
  "Unauthorized",
  "Forbidden",
  "Invalid credentials",
  "Invalid JSON body",
  "query is required",
]);

export function publicErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && SAFE_EXACT.has(error.message)) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (!message || INTERNAL.test(message) || message.length > 220) return fallback;
  if (process.env.NODE_ENV === "production") return fallback;
  return message;
}

export function publicJsonError(error: unknown, fallback: string, status = 500) {
  const message = publicErrorMessage(error, fallback);
  const resolved = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : status;
  return { error: message, status: resolved };
}
