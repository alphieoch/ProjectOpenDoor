import { getDb } from "@/lib/db";
import { users } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { sessionActorId, type SessionPayload } from "@/lib/auth";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function orgActorId(session: SessionPayload): Promise<string | null> {
  const db = getDb();
  const candidate = sessionActorId(session);
  if (UUID.test(candidate)) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, candidate))
      .limit(1);
    if (row) return row.id;
  }
  const [orgUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.organizationId, session.orgId))
    .limit(1);
  return orgUser?.id ?? null;
}
