import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiAssistants, assistantConnections, assistantConnectionTools } from "@opendoor/database";
import { eq, and, inArray } from "drizzle-orm";
import { getComposio, entityId } from "@/lib/composio/client";

async function getOwned(id: string, orgId: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: aiAssistants.id, organizationId: aiAssistants.organizationId })
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
  const connections = await db
    .select()
    .from(assistantConnections)
    .where(eq(assistantConnections.assistantId, id))
    .orderBy(assistantConnections.createdAt);

  // Fetch tools for all connections
  const connectionIds = connections.map((c) => c.id);
  const tools = connectionIds.length > 0
    ? await db
        .select()
        .from(assistantConnectionTools)
        .where(inArray(assistantConnectionTools.connectionId, connectionIds))
    : [];

  // Build connection → tools map
  const toolsByConn = new Map<string, typeof tools>();
  for (const t of tools) {
    const list = toolsByConn.get(t.connectionId) ?? [];
    list.push(t);
    toolsByConn.set(t.connectionId, list);
  }

  // Sync pending connections with Composio status
  const composio = getComposio();
  for (const conn of connections) {
    if (conn.status === "pending" && conn.connectedAccountId) {
      try {
        const account = await composio.connectedAccounts.get(conn.connectedAccountId);
        if (account.status === "ACTIVE") {
          await db
            .update(assistantConnections)
            .set({ status: "active" })
            .where(eq(assistantConnections.id, conn.id));
          conn.status = "active";
        }
      } catch {
        // Ignore sync errors
      }
    }
  }

  return NextResponse.json({
    connections: connections.map((c) => ({
      ...c,
      tools: toolsByConn.get(c.id) ?? [],
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  const { id } = await params;
  const assistant = await getOwned(id, session.orgId);
  if (!assistant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { appSlug, appName, appLogo, toolSlugs } = body;
  if (!appSlug) return NextResponse.json({ error: "appSlug is required" }, { status: 400 });

  const db = getDb();

  // Return existing active connection
  const [existing] = await db
    .select()
    .from(assistantConnections)
    .where(and(
      eq(assistantConnections.assistantId, id),
      eq(assistantConnections.appSlug, appSlug),
    ));

  if (existing?.status === "active" && !toolSlugs) {
    return NextResponse.json({ connection: existing, redirectUrl: null });
  }

  try {
    const composio = getComposio();
    const userId = entityId(session.orgId);

    let connection = existing;
    let redirectUrl: string | null = null;

    if (!existing) {
      // Find or create auth config for this toolkit
      const authConfigList = await composio.authConfigs.list({ toolkit: appSlug });
      let authConfigId = authConfigList.items[0]?.id ?? null;
      if (!authConfigId) {
        const authConfig = await composio.authConfigs.create(appSlug, {
          type: "use_composio_managed_auth",
          name: `${appName ?? appSlug} Auth Config`,
        });
        authConfigId = authConfig.id;
      }

      const request = await composio.connectedAccounts.link(userId, authConfigId, {
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/composio/callback`,
      });

      const connectedAccountId = request.id;
      redirectUrl = request.redirectUrl ?? null;
      const status = redirectUrl ? "pending" : "active";

      const [created] = await db
        .insert(assistantConnections)
        .values({
          assistantId:        id,
          organizationId:     session.orgId,
          appSlug,
          appName:            appName ?? appSlug,
          appLogo:            appLogo ?? null,
          connectedAccountId,
          status,
        })
        .returning();
      connection = created;
    }

    // Store selected tools
    if (toolSlugs && Array.isArray(toolSlugs) && toolSlugs.length > 0) {
      // Remove old selections
      await db
        .delete(assistantConnectionTools)
        .where(eq(assistantConnectionTools.connectionId, connection.id));

      // Insert new selections
      for (const slug of toolSlugs) {
        await db
          .insert(assistantConnectionTools)
          .values({
            connectionId: connection.id,
            toolSlug: slug,
            toolName: slug,
          });
      }
    }

    return NextResponse.json({ connection, redirectUrl }, { status: existing ? 200 : 201 });
  } catch (err: unknown) {
    console.error("Composio link error:", err);
    const message = err instanceof Error ? err.message : "Failed to initiate connection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
