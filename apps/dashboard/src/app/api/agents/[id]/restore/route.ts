import { NextRequest, NextResponse } from "next/server";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { ensureAgentSchema } from "@/lib/agents/ensure-schema";
import { loadOwnedAgent, purgeExpiredWorkspaceAgents, restoreWorkspaceAgent } from "@/lib/agents/lifecycle";
import { publicAgent } from "@/lib/agents/provision";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  await ensureAgentSchema();
  await purgeExpiredWorkspaceAgents();
  const { id } = await params;
  const row = await loadOwnedAgent(session.orgId, id, { includeDeleted: true });
  if (!row) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (!row.deletedAt) {
    return NextResponse.json({ error: "This agent is not in the recovery window." }, { status: 409 });
  }

  const restored = await restoreWorkspaceAgent(row);
  await logAuditEvent({
    organizationId: session.orgId,
    userId: sessionActorId(session),
    action: "agent.restored",
    entityType: "workspace_agent",
    entityId: row.id,
    metadata: { name: row.name, runtime: row.runtime },
  });

  return NextResponse.json({ agent: publicAgent(restored) });
}
