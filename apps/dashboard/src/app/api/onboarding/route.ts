import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { organizations } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { posthogServerCapture } from "@/lib/posthog-server";
import { loadOnboardingHome } from "@/lib/onboarding-progress";
import {
  parseOnboardingChecklist,
  type OnboardingChecklist,
} from "@/lib/onboarding";

type SupportedStep =
  | "api_key_created"
  | "first_chat_completed"
  | "enterprise_reviewed"
  | "dismissed";

function applyStep(
  checklist: OnboardingChecklist,
  step: SupportedStep
): OnboardingChecklist {
  const next = { ...checklist };
  if (step === "api_key_created") next.apiKeyCreated = true;
  if (step === "first_chat_completed") next.firstChatCompleted = true;
  if (step === "enterprise_reviewed") next.enterpriseReviewed = true;
  if (step === "dismissed") next.dismissedAt = new Date().toISOString();
  return next;
}

export async function GET() {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const home = await loadOnboardingHome(orgId, { isSiteAdmin: session.isSiteAdmin });

  return NextResponse.json({
    segment: home.evidence.onboardingSegment,
    plan: home.evidence.plan,
    planLabel: home.progress.planLabel,
    checklist: home.checklist,
    progress: home.progress,
    evidence: home.evidence,
    completed: home.progress.completed,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const orgId = session.orgId as string;
  const { step } = (await req.json()) as { step?: SupportedStep };
  const allowed = new Set<SupportedStep>([
    "api_key_created",
    "first_chat_completed",
    "enterprise_reviewed",
    "dismissed",
  ]);

  if (!step || !allowed.has(step)) {
    return NextResponse.json({ error: "Invalid onboarding step" }, { status: 400 });
  }

  const db = getDb();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      metadata: true,
    },
  });

  const metadata = (org?.metadata as Record<string, unknown> | null) || {};
  const currentChecklist = parseOnboardingChecklist(metadata.onboarding_checklist);
  const before = await loadOnboardingHome(orgId, { isSiteAdmin: session.isSiteAdmin });
  const nextChecklist = applyStep(currentChecklist, step);

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

  const home = await loadOnboardingHome(orgId, { isSiteAdmin: session.isSiteAdmin });
  if (!before.progress.completed && home.progress.completed) {
    posthogServerCapture(req, session.userId, "onboarding_completed", {
      organization_id: orgId,
      onboarding_plan: home.progress.planLabel,
      onboarding_step: step,
    });
  }

  return NextResponse.json({
    ok: true,
    checklist: nextChecklist,
    progress: home.progress,
    completed: home.progress.completed,
  });
}
