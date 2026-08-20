import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { apiKeys, workspaceAgents } from "@opendoor/database";
import { agentPurgeCutoff, detachOpenBotIsolation } from "@opendoor/shared";
import { getDb } from "@/lib/db";

type AgentRow = typeof workspaceAgents.$inferSelect;

export async function loadOwnedAgent(orgId: string, id: string, opts?: { includeDeleted?: boolean }) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workspaceAgents)
    .where(
      and(
        eq(workspaceAgents.id, id),
        eq(workspaceAgents.organizationId, orgId),
        opts?.includeDeleted ? undefined : isNull(workspaceAgents.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function softDeleteWorkspaceAgent(row: AgentRow) {
  if (row.deletedAt) return row;
  if (row.runtime === "openbot") await detachOpenBotIsolation(row.id);
  const db = getDb();
  const now = new Date();
  const [updated] = await db
    .update(workspaceAgents)
    .set({
      deletedAt: now,
      status: "stopped",
      statusMessage: "Removed. Recover within 7 days, then it is permanently deleted.",
      stoppedAt: now,
      updatedAt: now,
    })
    .where(eq(workspaceAgents.id, row.id))
    .returning();
  return updated ?? row;
}

export async function restoreWorkspaceAgent(row: AgentRow) {
  if (!row.deletedAt) return row;
  const db = getDb();
  const [updated] = await db
    .update(workspaceAgents)
    .set({
      deletedAt: null,
      status: "stopped",
      statusMessage: "Restored. Start it again to attach the computer.",
      updatedAt: new Date(),
    })
    .where(eq(workspaceAgents.id, row.id))
    .returning();
  return updated ?? row;
}

async function revokeAgentKey(apiKeyId: string | null) {
  if (!apiKeyId) return;
  const db = getDb();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(apiKeys.id, apiKeyId));
}

export async function purgeExpiredWorkspaceAgents(now = new Date()) {
  const db = getDb();
  const expired = await db
    .select()
    .from(workspaceAgents)
    .where(and(isNotNull(workspaceAgents.deletedAt), lte(workspaceAgents.deletedAt, agentPurgeCutoff(now))));

  for (const row of expired) {
    try {
      if (row.runtime === "openbot") await detachOpenBotIsolation(row.id);
    } catch {
      // Still remove the row if the computer is already gone.
    }
    await revokeAgentKey(row.apiKeyId);
    await db.delete(workspaceAgents).where(eq(workspaceAgents.id, row.id));
  }

  return expired.length;
}
