import { eq } from "drizzle-orm";
import { organizations } from "@opendoor/database";
import { getDb } from "@/lib/db";

export const HOUSE_MANAGEMENT_DEFAULT = true;

export function readHouseManagement(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return HOUSE_MANAGEMENT_DEFAULT;
  }
  const openbot = (metadata as { openbot?: unknown }).openbot;
  if (!openbot || typeof openbot !== "object" || Array.isArray(openbot)) {
    return HOUSE_MANAGEMENT_DEFAULT;
  }
  if (!("houseManagement" in openbot)) return HOUSE_MANAGEMENT_DEFAULT;
  return Boolean((openbot as { houseManagement?: unknown }).houseManagement);
}

export function withHouseManagement(metadata: unknown, enabled: boolean): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const openbot =
    base.openbot && typeof base.openbot === "object" && !Array.isArray(base.openbot)
      ? { ...(base.openbot as Record<string, unknown>) }
      : {};
  return { ...base, openbot: { ...openbot, houseManagement: enabled } };
}

export async function loadHouseManagement(orgId: string): Promise<boolean> {
  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { metadata: true },
  });
  return readHouseManagement(org?.metadata);
}
