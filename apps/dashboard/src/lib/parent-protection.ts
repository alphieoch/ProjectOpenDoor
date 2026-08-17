import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@opendoor/database";
import type { SessionPayload } from "@/lib/auth";

const BLOCKED_FOR_CHILD = [
  "/dashboard/playground",
  "/dashboard/studio",
  "/dashboard/premium",
  "/api/playground",
  "/api/studio",
  "/api/premium",
] as const;

export async function userIsProtectedChild(userId: string): Promise<boolean> {
  const db = getDb();
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { protectedChild: true },
  });
  return Boolean(row?.protectedChild);
}

export function childBlockedPath(pathname: string): boolean {
  return BLOCKED_FOR_CHILD.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function forbidProtectedChild(
  session: SessionPayload | null,
  label = "This area is locked on a parent-protected account. Use OpenDoor Chat instead."
): Promise<NextResponse | null> {
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await userIsProtectedChild(session.userId)) {
    return NextResponse.json({ error: label, code: "parent_protected" }, { status: 403 });
  }
  return null;
}
