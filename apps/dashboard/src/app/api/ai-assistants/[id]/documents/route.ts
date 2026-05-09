import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants, assistantDocuments } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { uploadToBlob } from "@/lib/azure/blob";
import { randomUUID } from "crypto";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf":                                                       "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain":     "txt",
  "text/markdown":  "md",
};
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

async function getOwned(id: string, orgId: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: aiAssistants.id })
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, orgId)));
  return row ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  const { id } = await params;
  if (!await getOwned(id, session.orgId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getDb();
  const docs = await db
    .select()
    .from(assistantDocuments)
    .where(eq(assistantDocuments.assistantId, id))
    .orderBy(assistantDocuments.createdAt);

  return NextResponse.json({ documents: docs });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  const { id } = await params;
  if (!await getOwned(id, session.orgId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Only PDF, DOCX, TXT and Markdown files are allowed" }, { status: 400 });

  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be under 10 MB" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const blobName = `assistant-docs/${session.orgId}/${id}/${randomUUID()}.${ext}`;
  const blobUrl = await uploadToBlob("assistant-assets", blobName, buffer, file.type);

  const db = getDb();
  const [doc] = await db
    .insert(assistantDocuments)
    .values({
      assistantId:    id,
      organizationId: session.orgId,
      name:           file.name,
      fileType:       ext,
      fileSizeBytes:  file.size,
      blobUrl,
      status:         "uploaded",
    })
    .returning();

  return NextResponse.json({ document: doc }, { status: 201 });
}
