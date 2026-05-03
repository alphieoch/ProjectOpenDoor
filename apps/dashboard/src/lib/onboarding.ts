export const ONBOARDING_SEGMENTS = [
  "standard",
  "education",
  "enterprise_intent",
] as const;

export type OnboardingSegment = (typeof ONBOARDING_SEGMENTS)[number];

export type OnboardingChecklist = {
  apiKeyCreated?: boolean;
  firstChatCompleted?: boolean;
  enterpriseReviewed?: boolean;
  completedAt?: string;
  dismissedAt?: string;
};

export function isOnboardingSegment(value: unknown): value is OnboardingSegment {
  return (
    typeof value === "string" &&
    (ONBOARDING_SEGMENTS as readonly string[]).includes(value)
  );
}

export function normalizeOnboardingSegment(
  value: unknown
): OnboardingSegment {
  if (isOnboardingSegment(value)) return value;
  return "standard";
}

export function parseOnboardingChecklist(value: unknown): OnboardingChecklist {
  if (!value || typeof value !== "object") return {};
  return value as OnboardingChecklist;
}

export function isChecklistComplete(
  segment: OnboardingSegment,
  checklist: OnboardingChecklist
): boolean {
  if (segment === "enterprise_intent") {
    return Boolean(checklist.enterpriseReviewed);
  }
  return Boolean(checklist.apiKeyCreated && checklist.firstChatCompleted);
}
