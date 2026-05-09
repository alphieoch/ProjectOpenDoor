import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { aiAssistants } from "@opendoor/database";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { password } = await req.json();
  const db = getDb();

  const [assistant] = await db
    .select()
    .from(aiAssistants)
    .where(eq(aiAssistants.slug, slug));

  if (!assistant || !assistant.enabled || !assistant.publishedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!assistant.passwordProtected) {
    return NextResponse.json({ valid: true });
  }

  if (!assistant.passwordHash) {
    return NextResponse.json({ valid: true });
  }

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 401 });
  }

  const valid = await verifyPassword(password, assistant.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
