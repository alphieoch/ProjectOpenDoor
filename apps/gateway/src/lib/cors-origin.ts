const FIRST_PARTY = [
  "http://localhost:3010",
  "http://127.0.0.1:3010",
  "https://opendoor-gcp.web.app",
  "https://opendoor-dashboard-u5ojp4qjiq-uc.a.run.app",
];

export function gatewayCorsOrigins() {
  const extra = (process.env.GATEWAY_CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const app = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const set = new Set<string>([...FIRST_PARTY, ...extra]);
  if (app) {
    try {
      set.add(new URL(app).origin);
    } catch {
      /* ignore */
    }
  }
  return [...set];
}

/** Echo an allowlisted browser origin. Never `*` with credentials. */
export function resolveGatewayCorsOrigin(origin: string | undefined | null) {
  if (!origin) return "";
  try {
    const normalized = new URL(origin).origin;
    return gatewayCorsOrigins().includes(normalized) ? normalized : "";
  } catch {
    return "";
  }
}
