import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "opendoor-default-secret-change-me"
);

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
    .sign(secret);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret, {
      clockTolerance: 60,
    });
    return payload;
  } catch {
    return null;
  }
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return payload as unknown as SessionPayload;
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

export async function requireSiteAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isSiteAdmin) redirect("/dashboard");
  return session;
}

export async function verifySiteAdmin(): Promise<{ session: SessionPayload } | { error: string; status: number }> {
  const session = await getSession();
  if (!session) return { error: "Unauthorized", status: 401 };
  if (!session.isSiteAdmin) return { error: "Forbidden", status: 403 };
  return { session };
}

export function getEffectiveOrgId(session: SessionPayload): string {
  return (session.impersonatingOrgId as string) || (session.orgId as string);
}

export function sessionActorId(session: SessionPayload): string {
  return String(session.userId || session.sub || "");
}
