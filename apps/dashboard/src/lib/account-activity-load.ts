import {
  apiKeys,
  auditLogs,
  houseChatMessages,
  houseChats,
  requests,
  trainingJobs,
  users,
  workflowRuns,
  workflows,
  workspaceAgents,
} from "@opendoor/database";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import {
  activityFromAgent,
  activityFromAudit,
  activityFromHouseChat,
  activityFromRequest,
  activityFromTrainingJob,
  activityFromWorkflowRun,
  mergeRecentActivity,
  RECENT_ACTIVITY_LIMIT,
  type ActivityItem,
} from "@/lib/account-activity";
import { getDb } from "@/lib/db";

const SOURCE_LIMIT = 15;

async function queryOrEmpty<T>(query: Promise<T[]>): Promise<T[]> {
  try {
    return await query;
  } catch {
    return [];
  }
}

export async function loadRecentAccountActivity(orgId: string): Promise<ActivityItem[]> {
  const db = getDb();

  const [auditRows, requestRows, agentRows, trainingRows, workflowRows, chatRows] =
    await Promise.all([
      queryOrEmpty(
        db
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            entityType: auditLogs.entityType,
            entityId: auditLogs.entityId,
            metadata: auditLogs.metadata,
            createdAt: auditLogs.createdAt,
            userName: users.name,
            userEmail: users.email,
          })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.userId, users.id))
          .where(eq(auditLogs.organizationId, orgId))
          .orderBy(desc(auditLogs.createdAt))
          .limit(SOURCE_LIMIT)
      ),
      queryOrEmpty(
        db
          .select({
            id: requests.id,
            modelId: requests.modelId,
            requestType: requests.requestType,
            status: requests.status,
            createdAt: requests.createdAt,
            apiKeyName: apiKeys.name,
          })
          .from(requests)
          .leftJoin(apiKeys, eq(requests.apiKeyId, apiKeys.id))
          .where(eq(requests.organizationId, orgId))
          .orderBy(desc(requests.createdAt))
          .limit(SOURCE_LIMIT)
      ),
      queryOrEmpty(
        db
          .select({
            id: workspaceAgents.id,
            name: workspaceAgents.name,
            runtime: workspaceAgents.runtime,
            lastUsedAt: workspaceAgents.lastUsedAt,
          })
          .from(workspaceAgents)
          .where(
            and(
              eq(workspaceAgents.organizationId, orgId),
              isNull(workspaceAgents.deletedAt),
              isNotNull(workspaceAgents.lastUsedAt)
            )
          )
          .orderBy(desc(workspaceAgents.lastUsedAt))
          .limit(SOURCE_LIMIT)
      ),
      queryOrEmpty(
        db
          .select({
            id: trainingJobs.id,
            name: trainingJobs.name,
            status: trainingJobs.status,
            method: trainingJobs.method,
            baseModelId: trainingJobs.baseModelId,
            createdAt: trainingJobs.createdAt,
            updatedAt: trainingJobs.updatedAt,
            finishedAt: trainingJobs.finishedAt,
          })
          .from(trainingJobs)
          .where(eq(trainingJobs.organizationId, orgId))
          .orderBy(desc(trainingJobs.updatedAt))
          .limit(SOURCE_LIMIT)
      ),
      queryOrEmpty(
        db
          .select({
            id: workflowRuns.id,
            status: workflowRuns.status,
            workflowId: workflowRuns.workflowId,
            workflowName: workflows.name,
            createdAt: workflowRuns.createdAt,
            completedAt: workflowRuns.completedAt,
          })
          .from(workflowRuns)
          .innerJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
          .where(eq(workflowRuns.organizationId, orgId))
          .orderBy(desc(workflowRuns.createdAt))
          .limit(SOURCE_LIMIT)
      ),
      queryOrEmpty(
        db
          .select({
            id: houseChatMessages.id,
            chatTitle: houseChats.title,
            createdAt: houseChatMessages.createdAt,
            userName: users.name,
            userEmail: users.email,
          })
          .from(houseChatMessages)
          .innerJoin(houseChats, eq(houseChatMessages.chatId, houseChats.id))
          .leftJoin(users, eq(houseChats.userId, users.id))
          .where(and(eq(houseChats.organizationId, orgId), eq(houseChatMessages.role, "user")))
          .orderBy(desc(houseChatMessages.createdAt))
          .limit(SOURCE_LIMIT)
      ),
    ]);

  return mergeRecentActivity(
    [
      ...auditRows.map(activityFromAudit),
      ...requestRows.map(activityFromRequest),
      ...agentRows.map(activityFromAgent),
      ...trainingRows.map(activityFromTrainingJob),
      ...workflowRows.map(activityFromWorkflowRun),
      ...chatRows.map(activityFromHouseChat),
    ],
    RECENT_ACTIVITY_LIMIT
  );
}
