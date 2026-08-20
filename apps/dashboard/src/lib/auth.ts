import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { users } from "@opendoor/database";
import { getDb } from "@/lib/db";
import { readSessionToken } from "@/lib/session-cookie";

function authSecretBytes() {
  const secret = process.env.AUTH_SECRET;
  const fallback = "opendoor-default-secret-change-me";
  const building = process.env.NEXT_PHASE === "phase-production-build";
  if (
    process.env.NODE_ENV === "production" &&
    !building &&
    (!secret || secret === fallback || secret.length < 16)
  ) {
    throw new Error("AUTH_SECRET must be set to a unique value in production");
  }
  return new TextEncoder().encode(secret || fallback);
}

export interface SessionPayload {
  userId: string;
  email: string;
  orgId: string;
  role: string;
  isSiteAdmin: boolean;
  impersonatingOrgId?: string;
  [key: string]: unknown;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(authSecretBytes());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, authSecretBytes(), {
      clockTolerance: 60,
    });
    return payload;
  } catch {
    return null;
  }
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const token = readSessionToken(cookieStore);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const session = payload as unknown as SessionPayload;
  try {
    const row = await getDb().query.users.findFirst({
      where: eq(users.id, session.userId),
      columns: { isSiteAdmin: true },
    });
    if (row) session.isSiteAdmin = Boolean(row.isSiteAdmin);
  } catch {
    // Keep the JWT flag if the database is unreachable.
  }
  return session;
});

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  // Transparently apply impersonation: callers just use session.orgId
  if (session.impersonatingOrgId) {
    return { ...session, orgId: session.impersonatingOrgId as string };
  }
  return session;
}

export function canAccessSiteAdmin(session: { isSiteAdmin?: boolean } | null): boolean {
  return Boolean(session?.isSiteAdmin);
}

export async function requireSiteAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessSiteAdmin(session)) redirect("/dashboard");
  return session;
}

export async function requireSiteAdminOrNotFound(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessSiteAdmin(session)) notFound();
  return session;
}

export async function verifySiteAdmin(): Promise<{ session: SessionPayload } | { error: string; status: number }> {
  const session = await getSession();
  if (!session) return { error: "Unauthorized", status: 401 };
  if (!canAccessSiteAdmin(session)) return { error: "Forbidden", status: 403 };
  return { session };
}

export function getEffectiveOrgId(session: SessionPayload): string {
  return (session.impersonatingOrgId as string) || (session.orgId as string);
}

export function sessionActorId(session: SessionPayload): string {
  return String(session.userId || session.sub || "");
}
