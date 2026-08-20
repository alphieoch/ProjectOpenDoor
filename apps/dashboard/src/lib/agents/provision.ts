import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { apiKeys, workspaceAgents } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { encryptAgentSecret } from "@/lib/agents/crypto";
import { getAgentRuntime } from "@/lib/agents/runtimes";
import { gatewayBaseUrl } from "@/lib/public-urls";
import { readWorkspace, workspacePublic } from "@/lib/agents/state";

export function publicAgent(row: typeof workspaceAgents.$inferSelect) {
  const runtime = getAgentRuntime(row.runtime);
  const workspace = readWorkspace(row.config);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    runtime: row.runtime,
    runtimeName: runtime?.name ?? row.runtime,
    modelId: row.modelId,
    systemPrompt: row.systemPrompt,
    status: row.status,
    statusMessage: row.statusMessage,
    keyPrefix: row.keyPrefix,
    kind: workspace.kind,
    workspace: workspacePublic(workspace),
    lastUsedAt: row.lastUsedAt,
    startedAt: row.startedAt,
    stoppedAt: row.stoppedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    gatewayUrl: `${gatewayBaseUrl()}/v1`,
  };
}

export async function provisionAgentKey(opts: {
  orgId: string;
  agentId: string;
  name: string;
  modelId: string;
}) {
  const rawKey = `opd_${randomBytes(32).toString("hex")}`;
  const prefix = rawKey.slice(0, 16);
  const hash = createHash("sha256").update(rawKey).digest("hex");
  const secret = encryptAgentSecret(rawKey);
  const db = getDb();

  const [key] = await db
    .insert(apiKeys)
    .values({
      name: `Agent · ${opts.name}`.slice(0, 255),
      keyHash: hash,
      keyPrefix: prefix,
      organizationId: opts.orgId,
      allowedModels: [opts.modelId],
    })
    .returning();

  await db
    .update(workspaceAgents)
    .set({
      apiKeyId: key.id,
      keyPrefix: prefix,
      secretCiphertext: secret.ciphertext,
      secretIv: secret.iv,
      secretTag: secret.tag,
      updatedAt: new Date(),
    })
    .where(eq(workspaceAgents.id, opts.agentId));

  return { keyId: key.id, prefix, rawKey };
}
