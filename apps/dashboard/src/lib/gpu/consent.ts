import { eq } from "drizzle-orm";
import { deviceInventoryConsents } from "@opendoor/database";
import { getDb } from "@/lib/db";
import { sessionActorId, type SessionPayload } from "@/lib/auth";

export const DEVICE_INVENTORY_CONSENT_VERSION = "device-inventory-v1";

export const DEVICE_INVENTORY_CONSENT_PURPOSE =
  "Read whether this machine has Metal or a GPU, usable memory, Ollama status, and local model tags. Used only to tell you if your dedicated metals can run a model. Not sold, not used for ads. You can withdraw at any time.";

export type DeviceInventoryConsentState = {
  granted: boolean;
  version: string;
  purpose: string;
  grantedAt: string | null;
  withdrawnAt: string | null;
};

function emptyState(): DeviceInventoryConsentState {
  return {
    granted: false,
    version: DEVICE_INVENTORY_CONSENT_VERSION,
    purpose: DEVICE_INVENTORY_CONSENT_PURPOSE,
    grantedAt: null,
    withdrawnAt: null,
  };
}

export async function getDeviceInventoryConsent(
  session: SessionPayload
): Promise<DeviceInventoryConsentState> {
  const userId = sessionActorId(session);
  if (!userId) return emptyState();
  try {
    const db = getDb();
    const row = await db.query.deviceInventoryConsents.findFirst({
      where: eq(deviceInventoryConsents.userId, userId),
    });
    if (!row) return emptyState();
    const current = row.version === DEVICE_INVENTORY_CONSENT_VERSION;
    return {
      granted: Boolean(row.granted && current && !row.withdrawnAt),
      version: DEVICE_INVENTORY_CONSENT_VERSION,
      purpose: DEVICE_INVENTORY_CONSENT_PURPOSE,
      grantedAt: row.grantedAt ? new Date(row.grantedAt).toISOString() : null,
      withdrawnAt: row.withdrawnAt ? new Date(row.withdrawnAt).toISOString() : null,
    };
  } catch {
    return emptyState();
  }
}

export async function hasDeviceInventoryConsent(session: SessionPayload): Promise<boolean> {
  const state = await getDeviceInventoryConsent(session);
  return state.granted;
}

export async function setDeviceInventoryConsent(
  session: SessionPayload,
  granted: boolean
): Promise<DeviceInventoryConsentState> {
  const userId = sessionActorId(session);
  const orgId = session.orgId as string;
  if (!userId || !orgId) return emptyState();

  const db = getDb();
  const now = new Date();
  await db
    .insert(deviceInventoryConsents)
    .values({
      organizationId: orgId,
      userId,
      granted,
      purpose: DEVICE_INVENTORY_CONSENT_PURPOSE,
      version: DEVICE_INVENTORY_CONSENT_VERSION,
      grantedAt: granted ? now : null,
      withdrawnAt: granted ? null : now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: deviceInventoryConsents.userId,
      set: {
        organizationId: orgId,
        granted,
        purpose: DEVICE_INVENTORY_CONSENT_PURPOSE,
        version: DEVICE_INVENTORY_CONSENT_VERSION,
        grantedAt: granted ? now : null,
        withdrawnAt: granted ? null : now,
        updatedAt: now,
      },
    });

  return getDeviceInventoryConsent(session);
}
