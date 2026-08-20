import {
  aiAssistants,
  apiKeys,
  houseChatMessages,
  houseChats,
  invitations,
  organizations,
  requests,
  trainingDatasets,
  trainingJobs,
  users,
  workflows,
  workspaceAgents,
} from "@opendoor/database";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  isInternalApiKeyName,
  parseOnboardingChecklist,
  resolveGettingStarted,
  type GettingStartedProgress,
  type OnboardingChecklist,
  type OnboardingEvidence,
} from "@/lib/onboarding";

export type RecentAgent = {
  id: string;
  name: string;
  runtime: string;
  status: string;
  href: string;
};

export type OnboardingHomeData = {
  evidence: OnboardingEvidence;
  progress: GettingStartedProgress;
  checklist: OnboardingChecklist;
  recentAgents: RecentAgent[];
};

async function countOrZero(query: Promise<{ count: number }[]>): Promise<number> {
  try {
    const rows = await query;
    return Number(rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

export async function loadOnboardingHome(
  orgId: string,
  opts?: { isSiteAdmin?: boolean }
): Promise<OnboardingHomeData> {
  const db = getDb();

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      plan: true,
      onboardingSegment: true,
      metadata: true,
    },
  }).catch(() => null);

  const metadata = (org?.metadata as Record<string, unknown> | null) || {};
  const checklist = parseOnboardingChecklist(metadata.onboarding_checklist);

  const [
    houseChatUserMessages,
    agentCount,
    assistantCount,
    trainingJobCount,
    trainingDatasetCount,
    workflowCount,
    imageRequestCount,
    memberCount,
    inviteCount,
    keyRows,
    gatewayRequestCount,
    recentAgentRows,
  ] = await Promise.all([
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(houseChatMessages)
        .innerJoin(houseChats, eq(houseChatMessages.chatId, houseChats.id))
        .where(and(eq(houseChats.organizationId, orgId), eq(houseChatMessages.role, "user")))
    ),
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(workspaceAgents)
        .where(and(eq(workspaceAgents.organizationId, orgId), isNull(workspaceAgents.deletedAt)))
    ),
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(aiAssistants)
        .where(eq(aiAssistants.organizationId, orgId))
    ),
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(trainingJobs)
        .where(eq(trainingJobs.organizationId, orgId))
    ),
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(trainingDatasets)
        .where(eq(trainingDatasets.organizationId, orgId))
    ),
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(workflows)
        .where(eq(workflows.organizationId, orgId))
    ),
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(requests)
        .where(and(eq(requests.organizationId, orgId), eq(requests.requestType, "image")))
    ),
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(eq(users.organizationId, orgId))
    ),
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(invitations)
        .where(eq(invitations.organizationId, orgId))
    ),
    db
      .select({ name: apiKeys.name })
      .from(apiKeys)
      .where(and(eq(apiKeys.organizationId, orgId), isNull(apiKeys.revokedAt)))
      .catch(() => [] as { name: string }[]),
    countOrZero(
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(requests)
        .where(eq(requests.organizationId, orgId))
    ),
    db
      .select({
        id: workspaceAgents.id,
        name: workspaceAgents.name,
        runtime: workspaceAgents.runtime,
        status: workspaceAgents.status,
      })
      .from(workspaceAgents)
      .where(and(eq(workspaceAgents.organizationId, orgId), isNull(workspaceAgents.deletedAt)))
      .orderBy(desc(workspaceAgents.updatedAt))
      .limit(24)
      .catch(() => [] as { id: string; name: string; runtime: string; status: string }[]),
  ]);

  const evidence: OnboardingEvidence = {
    houseChatUserMessages,
    agentCount,
    assistantCount,
    trainingJobCount,
    trainingDatasetCount,
    workflowCount,
    imageRequestCount,
    memberCount,
    inviteCount,
    userApiKeyCount: keyRows.filter((row) => !isInternalApiKeyName(row.name)).length,
    gatewayRequestCount,
    apiKeyCreated: checklist.apiKeyCreated,
    firstChatCompleted: checklist.firstChatCompleted,
    dismissedAt: checklist.dismissedAt || null,
    completedAt: checklist.completedAt || null,
    plan: org?.plan || "free",
    isSiteAdmin: Boolean(opts?.isSiteAdmin),
    onboardingSegment: org?.onboardingSegment || null,
  };

  return {
    evidence,
    progress: resolveGettingStarted(evidence),
    checklist,
    recentAgents: recentAgentRows.map((row) => ({
      id: row.id,
      name: row.name,
      runtime: row.runtime,
      status: row.status,
      href: row.runtime === "openbot" ? `/dashboard/openbot/${row.id}` : `/dashboard/agents/${row.id}`,
    })),
  };
}
