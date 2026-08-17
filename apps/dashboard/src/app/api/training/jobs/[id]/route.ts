import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { trainingJobs } from "@opendoor/database";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { enqueueTrainingJob } from "@/lib/training/runner";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  const db = getDb();
  const rows = await db
    .select()
    .from(trainingJobs)
    .where(and(eq(trainingJobs.id, id), eq(trainingJobs.organizationId, orgId)))
    .limit(1);
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job: rows[0] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action || "retry";

  const db = getDb();
  const rows = await db
    .select()
    .from(trainingJobs)
    .where(and(eq(trainingJobs.id, id), eq(trainingJobs.organizationId, orgId)))
    .limit(1);
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "cancel") {
    const [job] = await db
      .update(trainingJobs)
      .set({
        status: "cancelled",
        statusMessage: "Cancelled by user",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingJobs.id, id))
      .returning();
    return NextResponse.json({ job });
  }

  if (action === "retry") {
    await db
      .update(trainingJobs)
      .set({
        status: "queued",
        progressPercent: 0,
        statusMessage: "Re-queued",
        updatedAt: new Date(),
      })
      .where(eq(trainingJobs.id, id));
    enqueueTrainingJob(id).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
