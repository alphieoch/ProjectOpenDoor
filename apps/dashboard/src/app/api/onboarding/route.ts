import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import {
  isChecklistComplete,
  normalizeOnboardingSegment,
  parseOnboardingChecklist,
} from "@/lib/onboarding";

type SupportedStep = "api_key_created" | "first_chat_completed" | "enterprise_reviewed";

function applyStep(
  checklist: Record<string, unknown>,
  step: SupportedStep
): Record<string, unknown> {
  const next = { ...checklist };
  if (step === "api_key_created") next.apiKeyCreated = true;
  if (step === "first_chat_completed") next.firstChatCompleted = true;
  if (step === "enterprise_reviewed") next.enterpriseReviewed = true;
  return next;
}

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const db = getDb();

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      onboardingSegment: true,
      metadata: true,
    },
  });

  const segment = normalizeOnboardingSegment(org?.onboardingSegment);
  const metadata = (org?.metadata as Record<string, unknown> | null) || {};
  const checklist = parseOnboardingChecklist(metadata.onboarding_checklist);
  const completed = isChecklistComplete(segment, checklist);

  return NextResponse.json({ segment, checklist, completed });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { step } = (await req.json()) as { step?: SupportedStep };
  const allowed = new Set<SupportedStep>([
    "api_key_created",
    "first_chat_completed",
    "enterprise_reviewed",
  ]);

  if (!step || !allowed.has(step)) {
    return NextResponse.json({ error: "Invalid onboarding step" }, { status: 400 });
  }

  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      onboardingSegment: true,
      metadata: true,
    },
  });

  const segment = normalizeOnboardingSegment(org?.onboardingSegment);
  const metadata = (org?.metadata as Record<string, unknown> | null) || {};
  const currentChecklist = parseOnboardingChecklist(metadata.onboarding_checklist);
  const nextChecklist = applyStep(
    currentChecklist as Record<string, unknown>,
    step
  );

  if (isChecklistComplete(segment, nextChecklist)) {
    nextChecklist.completedAt = new Date().toISOString();
  }

  await db
    .update(organizations)
    .set({
      metadata: {
        ...metadata,
        onboarding_checklist: nextChecklist,
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  return NextResponse.json({ ok: true, checklist: nextChecklist });
}
