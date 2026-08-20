import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { organizations, users, workspaceAgentMessages, workspaceAgents } from "@opendoor/database";
import { requireAuth } from "@/lib/auth";
import { ensureAgentSchema } from "@/lib/agents/ensure-schema";
import { purgeExpiredWorkspaceAgents } from "@/lib/agents/lifecycle";
import { loadAgentsEntitlement } from "@/lib/agents/entitlement";
import { loadEnterpriseAccess } from "@/lib/enterprise";
import { publicAgent } from "@/lib/agents/provision";
import { getDb } from "@/lib/db";
import { agentPurgeAt, daysLeftToRecover, getPlan, hasOpenBotSupervisor, workspaceHasEnterpriseTools } from "@opendoor/shared";
import { summarizeOpenBotCapacity } from "@/lib/openbot-leader";
import { readHouseManagement, withHouseManagement } from "@/lib/openbot-settings";

export async function GET() {
  const session = await requireAuth();
  await ensureAgentSchema();
  await purgeExpiredWorkspaceAgents();
  const db = getDb();
  const orgId = session.orgId as string;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [rows, deletedRows, addon, enterprise, members, org] = await Promise.all([
    db
      .select()
      .from(workspaceAgents)
      .where(and(
        eq(workspaceAgents.organizationId, orgId),
        eq(workspaceAgents.runtime, "openbot"),
        isNull(workspaceAgents.deletedAt),
      ))
      .orderBy(desc(workspaceAgents.updatedAt)),
    db
      .select()
      .from(workspaceAgents)
      .where(and(
        eq(workspaceAgents.organizationId, orgId),
        eq(workspaceAgents.runtime, "openbot"),
        isNotNull(workspaceAgents.deletedAt),
      ))
      .orderBy(desc(workspaceAgents.deletedAt)),
    loadAgentsEntitlement(orgId, session),
    loadEnterpriseAccess(orgId, session),
    db.query.users.findMany({
      where: eq(users.organizationId, orgId),
      columns: { id: true, email: true, name: true, role: true },
      orderBy: (table, { asc }) => [asc(table.name), asc(table.email)],
    }),
    db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        name: true,
        plan: true,
        metadata: true,
        ssoEnabled: true,
        ssoDefaultRole: true,
        workosConnectionId: true,
        workosOrganizationId: true,
      },
    }),
  ]);

  const ids = rows.map((row) => row.id);
  const messageCounts =
    ids.length === 0
      ? []
      : await db
          .select({
            agentId: workspaceAgentMessages.agentId,
            count: sql<number>`count(*)`,
          })
          .from(workspaceAgentMessages)
          .where(
            and(
              eq(workspaceAgentMessages.organizationId, orgId),
              inArray(workspaceAgentMessages.agentId, ids),
              gte(workspaceAgentMessages.createdAt, since),
            ),
          )
          .groupBy(workspaceAgentMessages.agentId);

  const countById = new Map(messageCounts.map((row) => [row.agentId, Number(row.count)]));
  const bots = rows.map((row) => {
    const agent = publicAgent(row);
    const skills = agent.workspace.skills.map((skill) => skill.name);
    const isolation =
      agent.workspace.computer?.isolation?.mode === "container"
        ? "isolated Chromium"
        : agent.workspace.computer?.backend === "live"
          ? "shared Chromium"
          : "in-process";
    return {
      id: agent.id,
      name: agent.name,
      kind: agent.kind || (agent.workspace.kind === "leader" ? "leader" : "coworker"),
      status: agent.status,
      statusMessage: agent.statusMessage,
      modelId: agent.modelId,
      isolation,
      lastUsedAt: agent.lastUsedAt,
      messages30d: countById.get(agent.id) || 0,
      skills,
    };
  });

  const plugins = [
    ...new Set([
      "OpenBot computer",
      ...bots.flatMap((bot) => bot.skills),
    ]),
  ];

  return NextResponse.json({
    workspace: org?.name || "OpenDoor",
    houseManagement: readHouseManagement(org?.metadata),
    addon,
    bots,
    deletedBots: deletedRows.flatMap((row) => {
      if (!row.deletedAt) return [];
      return [{
        id: row.id,
        name: row.name,
        deletedAt: row.deletedAt,
        daysLeft: daysLeftToRecover(row.deletedAt),
        recoverUntil: agentPurgeAt(row.deletedAt).toISOString(),
      }];
    }),
    usage: {
      bots: bots.length,
      running: bots.filter((bot) => bot.status === "running").length,
      messages30d: bots.reduce((sum, bot) => sum + bot.messages30d, 0),
    },
    limits: summarizeOpenBotCapacity({
      plan: org?.plan || getPlan(undefined).id,
      addonActive: addon.active,
      addonStatus: addon.status,
      addonIncludedInPlan: addon.includedInPlan,
      supervisor: hasOpenBotSupervisor(),
      sharedComputer: Boolean(process.env.OPENBOT_COMPUTER_URL || process.env.AGENT_COMPUTER_URL),
      bots: rows.map((row) => ({
        status: row.status,
        computer: publicAgent(row).workspace.computer,
      })),
    }),
    members: members.map((member) => ({
      id: member.id,
      name: member.name || member.email.split("@")[0],
      email: member.email,
      role: member.role,
    })),
    plugins,
    sso: {
      enterprise: workspaceHasEnterpriseTools({
        plan: org?.plan || enterprise.plan,
        isSiteAdmin: session.isSiteAdmin,
      }),
      plan: enterprise.plan,
      enabled: Boolean(org?.ssoEnabled),
      defaultRole: org?.ssoDefaultRole || "member",
      connectionId: org?.workosConnectionId || null,
      organizationId: org?.workosOrganizationId || null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAuth();
  const db = getDb();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.houseManagement !== "boolean") {
    return NextResponse.json({ error: "houseManagement must be a boolean" }, { status: 400 });
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, session.orgId),
    columns: { metadata: true },
  });
  await db
    .update(organizations)
    .set({
      metadata: withHouseManagement(org?.metadata, body.houseManagement),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, session.orgId));

  return NextResponse.json({ houseManagement: body.houseManagement });
}
