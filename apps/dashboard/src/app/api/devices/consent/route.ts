import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  getDeviceInventoryConsent,
  setDeviceInventoryConsent,
} from "@/lib/gpu/consent";

export async function GET() {
  const session = await requireAuth();
  const consent = await getDeviceInventoryConsent(session);
  return NextResponse.json({ consent });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const granted = body.granted === true;
  const consent = await setDeviceInventoryConsent(session, granted);

  await logAuditEvent({
    organizationId: session.orgId as string,
    userId: session.userId,
    action: granted ? "device_inventory.consented" : "device_inventory.withdrawn",
    entityType: "device_inventory_consent",
    entityId: session.userId,
    metadata: {
      version: consent.version,
      granted: consent.granted,
    },
  });

  return NextResponse.json({ consent });
}
