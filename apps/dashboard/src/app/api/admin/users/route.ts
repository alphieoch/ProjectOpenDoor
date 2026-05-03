import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users, organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { verifySiteAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await verifySiteAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getDb();

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isSiteAdmin: users.isSiteAdmin,
      createdAt: users.createdAt,
      organizationId: users.organizationId,
      orgName: organizations.name,
    })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .orderBy(users.createdAt);

  return NextResponse.json({ users: result });
}
