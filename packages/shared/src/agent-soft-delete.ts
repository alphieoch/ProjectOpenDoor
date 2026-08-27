export const AGENT_SOFT_DELETE_RETENTION_DAYS = 7;
export const AGENT_SOFT_DELETE_RETENTION_MS = AGENT_SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function agentPurgeAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + AGENT_SOFT_DELETE_RETENTION_MS);
}

export function agentPurgeCutoff(now = new Date()): Date {
  return new Date(now.getTime() - AGENT_SOFT_DELETE_RETENTION_MS);
}

export function isAgentPurgeDue(deletedAt: Date, now = new Date()): boolean {
  return now.getTime() >= agentPurgeAt(deletedAt).getTime();
}

export function daysLeftToRecover(deletedAt: Date, now = new Date()): number {
  const remaining = agentPurgeAt(deletedAt).getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}
