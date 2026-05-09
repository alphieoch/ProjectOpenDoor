import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants, assistantApiSecrets } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { encryptSecret } from "@/lib/api-connections/crypto";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const db = getDb();

  const [assistant] = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, session.orgId)));

  if (!assistant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Return connections without secret IDs (frontend doesn't need them)
  const connections = (assistant.apiConnections ?? []).map((conn: any) => ({
    id: conn.id,
    name: conn.name,
    baseUrl: conn.baseUrl,
    authType: conn.authType,
    apiKeyHeader: conn.apiKeyHeader,
    docsUrl: conn.docsUrl,
    enabled: conn.enabled,
    endpoints: conn.endpoints ?? [],
  }));

  return NextResponse.json({ connections });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const db = getDb();

  const [assistant] = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, session.orgId)));

  if (!assistant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get("connectionId");
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
  }

  const currentConnections = (assistant.apiConnections ?? []) as any[];
  const connectionToRemove = currentConnections.find((c) => c.id === connectionId);
  if (!connectionToRemove) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  // Delete the secret
  if (connectionToRemove.secretId) {
    await db
      .delete(assistantApiSecrets)
      .where(
        and(
          eq(assistantApiSecrets.id, connectionToRemove.secretId),
          eq(assistantApiSecrets.assistantId, id)
        )
      );
  }

  const updatedConnections = currentConnections.filter((c) => c.id !== connectionId);
  await db
    .update(aiAssistants)
    .set({ apiConnections: updatedConnections, updatedAt: new Date() })
    .where(eq(aiAssistants.id, id));

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const db = getDb();

  const [assistant] = await db
    .select()
    .from(aiAssistants)
    .where(and(eq(aiAssistants.id, id), eq(aiAssistants.organizationId, session.orgId)));

  if (!assistant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { connectionId, name, baseUrl, authType, apiKey, apiKeyHeader, docsUrl, enabled, endpoints } = body;

  if (!connectionId) {
    return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
  }

  const currentConnections = (assistant.apiConnections ?? []) as any[];
  const idx = currentConnections.findIndex((c) => c.id === connectionId);
  if (idx === -1) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const conn = currentConnections[idx];

  // Update secret if apiKey provided
  if (apiKey !== undefined && apiKey !== "") {
    const encrypted = encryptSecret(apiKey);
    await db
      .update(assistantApiSecrets)
      .set({
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
      })
      .where(
        and(eq(assistantApiSecrets.id, conn.secretId), eq(assistantApiSecrets.assistantId, id))
      );
  }

  const updated = {
    ...conn,
    name: name !== undefined ? name.trim() : conn.name,
    baseUrl: baseUrl !== undefined ? baseUrl.trim().replace(/\/$/, "") : conn.baseUrl,
    authType: authType !== undefined ? authType : conn.authType,
    apiKeyHeader: apiKeyHeader !== undefined ? apiKeyHeader : conn.apiKeyHeader,
    docsUrl: docsUrl !== undefined ? docsUrl.trim() : conn.docsUrl,
    enabled: enabled !== undefined ? enabled : conn.enabled,
    endpoints: endpoints !== undefined ? endpoints : conn.endpoints,
  };

  currentConnections[idx] = updated;

  await db
    .update(aiAssistants)
    .set({ apiConnections: currentConnections, updatedAt: new Date() })
    .where(eq(aiAssistants.id, id));

  return NextResponse.json({ connection: updated });
}
