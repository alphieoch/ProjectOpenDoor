import { NextResponse } from "next/server";

type Bucket = { n: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const LIMITS = {
  login: { ip: 20, email: 8, windowMs: 60_000 },
  signup: { ip: 8, email: 3, windowMs: 60 * 60_000 },
} as const;

function prune(now: number) {
  if (buckets.size < 2_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

function take(key: string, limit: number, windowMs: number, now: number): { ok: boolean; retryAfterSec: number } {
  const cur = buckets.get(key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { n: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: Math.ceil(windowMs / 1000) };
  }
  cur.n += 1;
  const retryAfterSec = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
  return { ok: cur.n <= limit, retryAfterSec };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function enforceAuthRateLimit(
  kind: "login" | "signup",
  req: Request,
  email?: string
): NextResponse | null {
  const now = Date.now();
  prune(now);
  const limits = LIMITS[kind];
  const ip = clientIp(req);
  const ipHit = take(`auth:${kind}:ip:${ip}`, limits.ip, limits.windowMs, now);
  if (!ipHit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipHit.retryAfterSec) } }
    );
  }
  const normalized = email?.toLowerCase().trim();
  if (!normalized) return null;
  const emailHit = take(`auth:${kind}:email:${normalized}`, limits.email, limits.windowMs, now);
  if (!emailHit.ok) {
    return NextResponse.json(
      { error: "Too many attempts for this email. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(emailHit.retryAfterSec) } }
    );
  }
  return null;
}
