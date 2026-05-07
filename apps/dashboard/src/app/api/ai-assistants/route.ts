import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants } from "@opendoor/database";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await requireAuth();
  const db = getDb();
  const rows = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.organizationId, session.orgId), eq(aiAssistants.enabled, true)))
    .orderBy(aiAssistants.createdAt);
  return NextResponse.json({ assistants: rows });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const body = await req.json();
  const {
    name, slug, description, avatarLetter, primaryColor,
    modelId, systemPrompt, welcomeMessage, maxMessages,
    visibility, monetization, priceCents,
  } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }

  const db = getDb();
  const [created] = await db
    .insert(aiAssistants)
    .values({
      organizationId: session.orgId,
      createdBy:      session.userId,
      name:           name.trim(),
      slug:           slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      description:    description || null,
      avatarLetter:   avatarLetter || name.charAt(0).toUpperCase(),
      primaryColor:   primaryColor || "#1A73E8",
      modelId:        modelId || "gpt-4o",
      systemPrompt:   systemPrompt || null,
      welcomeMessage: welcomeMessage || null,
      maxMessages:    maxMessages ? parseInt(maxMessages) : null,
      visibility:     visibility || "private",
      monetization:   monetization || "free",
      priceCents:     priceCents ? parseInt(priceCents) : 0,
    })
    .returning();

  return NextResponse.json({ assistant: created }, { status: 201 });
}
