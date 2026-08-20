import { NextRequest, NextResponse } from "next/server";
import { requireAuth, sessionActorId } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { getRental, stopRental } from "@/lib/premium/rentals";
import { premiumPageError, withEnsuredSchema } from "@/lib/premium/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const rental = await withEnsuredSchema(() => getRental(session.orgId as string, id));
    if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });
    return NextResponse.json({ rental });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[premium/rentals/:id] GET", err);
    return NextResponse.json({ error: premiumPageError(err, "Could not load rental") }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const orgId = session.orgId as string;
    const { id } = await params;
    const existing = await withEnsuredSchema(() => getRental(orgId, id));
    if (!existing) return NextResponse.json({ error: "Rental not found" }, { status: 404 });
    const stopped = await stopRental(orgId, id);
    await logAuditEvent({
      organizationId: orgId,
      userId: sessionActorId(session),
      action: "premium.rental.stopped",
      entityType: "premium_rental",
      entityId: id,
    });
    return NextResponse.json({ rental: stopped ? { ...existing, status: "stopped" } : existing });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[premium/rentals/:id] DELETE", err);
    return NextResponse.json({ error: premiumPageError(err, "Could not stop rental") }, { status: 500 });
  }
}
