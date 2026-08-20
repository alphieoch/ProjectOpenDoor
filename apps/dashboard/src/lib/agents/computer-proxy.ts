import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaceAgents } from "@opendoor/database";
import {
  applyComputerControl,
  applyIsolation,
  ensureOpenBotIsolation,
  liveComputerSetupHint,
  liveOpenBotComputer,
  readWorkspace,
  recordOpenBotAudit,
  withIsolationStatus,
  type ComputerIsolation,
} from "@opendoor/shared";

type WorkspaceControl = {
  holder: "bot" | "human";
  since: string;
  reason?: string;
  requested: boolean;
};

export async function loadOwnedAgent(orgId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workspaceAgents)
    .where(and(eq(workspaceAgents.id, id), eq(workspaceAgents.organizationId, orgId), isNull(workspaceAgents.deletedAt)))
    .limit(1);
  return row;
}

export async function liveComputerForAgent(orgId: string, id: string) {
  const row = await loadOwnedAgent(orgId, id);
  if (!row) return { row: null, computer: null as Awaited<ReturnType<typeof liveOpenBotComputer>> };
  if (row.runtime !== "openbot") return { row, computer: null as Awaited<ReturnType<typeof liveOpenBotComputer>> };
  const fallbackUrl = readWorkspace(row.config).computer.isolation?.url;
  return {
    row,
    computer: await liveOpenBotComputer(row.id, { ensure: false, fallbackUrl }),
  };
}

async function waitForHealth(
  computer: NonNullable<Awaited<ReturnType<typeof liveOpenBotComputer>>>,
  attempts = 12,
) {
  let last: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await computer.health();
      return;
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw last ?? new Error("The computer started but is not answering yet.");
}

export async function persistComputerIsolation(
  row: typeof workspaceAgents.$inferSelect,
  isolation: ComputerIsolation,
) {
  const db = getDb();
  const ws = readWorkspace(row.config);
  ws.computer = applyIsolation(ws.computer, isolation);
  const [saved] = await db
    .update(workspaceAgents)
    .set({
      config: ws,
      statusMessage: withIsolationStatus(row.statusMessage, isolation),
      updatedAt: new Date(),
    })
    .where(eq(workspaceAgents.id, row.id))
    .returning();
  return saved || row;
}

export async function ensureComputerForAgent(orgId: string, id: string) {
  const row = await loadOwnedAgent(orgId, id);
  if (!row) return { row: null, computer: null as Awaited<ReturnType<typeof liveOpenBotComputer>>, isolation: null };
  if (row.runtime !== "openbot") {
    return { row, computer: null as Awaited<ReturnType<typeof liveOpenBotComputer>>, isolation: null };
  }
  const isolation = await ensureOpenBotIsolation(row.id);
  const saved = await persistComputerIsolation(row, isolation);
  const computer = await liveOpenBotComputer(row.id, { ensure: false, fallbackUrl: isolation.url });
  if (!computer) {
    throw new Error(liveComputerSetupHint());
  }
  await waitForHealth(computer);
  return { row: saved, computer, isolation };
}

export function workspaceControl(row: typeof workspaceAgents.$inferSelect): WorkspaceControl {
  const computer = readWorkspace(row.config).computer;
  return {
    holder: computer.operator,
    since: new Date().toISOString(),
    reason: computer.helpReason || undefined,
    requested: computer.status === "help_requested",
  };
}

export async function persistComputerHandover(
  row: typeof workspaceAgents.$inferSelect,
  control: "take" | "release",
) {
  const db = getDb();
  const ws = readWorkspace(row.config);
  ws.computer = applyComputerControl(ws.computer, control);
  const audited = recordOpenBotAudit(ws, {
    action: control === "take" ? "computer.control_taken" : "computer.control_released",
    detail: control === "take" ? "A person took the wheel." : "Control returned to the bot.",
    allowed: true,
    rule: "human_control",
    outcome: "permitted",
  });
  const [saved] = await db
    .update(workspaceAgents)
    .set({ config: audited, updatedAt: new Date() })
    .where(eq(workspaceAgents.id, row.id))
    .returning();
  return saved || row;
}
