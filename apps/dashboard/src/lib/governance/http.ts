import { NextResponse } from "next/server";
import { requireAuth, type SessionPayload } from "@/lib/auth";
import { enterpriseRequiredResponse, loadEnterpriseAccess } from "@/lib/enterprise";

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export async function governanceSession(): Promise<SessionPayload | null> {
  try {
    const session = await requireAuth();
    const access = await loadEnterpriseAccess(session.orgId, session);
    if (!access.active) return null;
    return session;
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return null;
    throw err;
  }
}

export function enterpriseRequired() {
  return enterpriseRequiredResponse();
}

export function emptyOnMissingTable<T>(fallback: T, err: unknown): T {
  const message = err instanceof Error ? err.message : String(err);
  if (/relation .* does not exist|undefined table|column .* does not exist/i.test(message)) {
    return fallback;
  }
  throw err;
}
