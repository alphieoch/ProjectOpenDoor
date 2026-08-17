import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hasDeviceInventoryConsent } from "@/lib/gpu/consent";
import { summarizeDedicatedMetals } from "@/lib/gpu/dedicated";
import { detectGpuStatus } from "@/lib/gpu/detect";

export async function GET() {
  const session = await requireAuth();
  if (!(await hasDeviceInventoryConsent(session))) {
    return NextResponse.json(
      { error: "device_inventory_consent_required", granted: false },
      { status: 403 }
    );
  }
  const status = await detectGpuStatus();
  try {
    const dedicated = await summarizeDedicatedMetals(session.orgId as string, status);
    return NextResponse.json({ ...status, dedicated });
  } catch {
    return NextResponse.json({ ...status });
  }
}
