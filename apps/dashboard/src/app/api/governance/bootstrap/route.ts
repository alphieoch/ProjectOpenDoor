import { NextResponse } from "next/server";
import { bootstrapGovernance } from "@/lib/governance/bootstrap";
import { governanceSession, unauthorized } from "@/lib/governance/http";
import { orgActorId } from "@/lib/governance/actor";

export async function POST() {
  const session = await governanceSession();
  if (!session) return unauthorized();

  try {
    const userId = await orgActorId(session);
    const created = await bootstrapGovernance({
      orgId: session.orgId,
      userId,
    });
    return NextResponse.json({ ok: true, created });
  } catch (err) {
    console.error("Governance bootstrap failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to set up governance" },
      { status: 500 },
    );
  }
}
