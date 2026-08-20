import { SYSTEM_ASSISTANT_KEY_NAME, getPlan } from "@opendoor/shared";

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

export const GETTING_STARTED_STEPS = [
  "chat",
  "coworker",
  "training",
  "workflow",
  "studio",
  "team",
  "developer",
] as const;

export type GettingStartedStepId = (typeof GETTING_STARTED_STEPS)[number];

export const REQUIRED_GETTING_STARTED_STEPS: GettingStartedStepId[] = [
  "chat",
  "coworker",
];

export type GettingStartedStepMeta = {
  id: GettingStartedStepId;
  title: string;
  description: string;
  href: string;
  cta: string;
  doneCta: string;
  optional: boolean;
};

export const GETTING_STARTED_CATALOG: Record<GettingStartedStepId, GettingStartedStepMeta> = {
  chat: {
    id: "chat",
    title: "Start a conversation",
    description: "Open Chat and send your first message. This is the fastest way into OpenDoor.",
    href: "/dashboard/chat",
    cta: "Open Chat",
    doneCta: "Open Chat",
    optional: false,
  },
  coworker: {
    id: "coworker",
    title: "Add a coworker",
    description: "Bring an OpenBot coworker online, or create an agent or AI assistant.",
    href: "/dashboard/openbot",
    cta: "Open OpenBot",
    doneCta: "View coworkers",
    optional: false,
  },
  training: {
    id: "training",
    title: "Train a model",
    description: "Optional — start a fine-tune if you have a model goal.",
    href: "/dashboard/training",
    cta: "Open Training",
    doneCta: "View Training",
    optional: true,
  },
  workflow: {
    id: "workflow",
    title: "Build a workflow",
    description: "Optional — chain steps your team can rerun.",
    href: "/dashboard/workflow",
    cta: "Open Workflow",
    doneCta: "View Workflow",
    optional: true,
  },
  studio: {
    id: "studio",
    title: "Make something in Studio",
    description: "Optional — generate an image or clip in Studio or Media.",
    href: "/dashboard/studio",
    cta: "Open Studio",
    doneCta: "Open Studio",
    optional: true,
  },
  team: {
    id: "team",
    title: "Invite your team",
    description: "Bring a teammate into this workspace when you are ready.",
    href: "/dashboard/team",
    cta: "Open Team",
    doneCta: "View Team",
    optional: true,
  },
  developer: {
    id: "developer",
    title: "Developer access",
    description: "Optional — create an API key and try the playground or gateway.",
    href: "/dashboard/api-keys",
    cta: "Create API key",
    doneCta: "Open Playground",
    optional: true,
  },
};

export type OnboardingEvidence = {
  houseChatUserMessages: number;
  agentCount: number;
  assistantCount: number;
  trainingJobCount: number;
  trainingDatasetCount: number;
  workflowCount: number;
  imageRequestCount: number;
  memberCount: number;
  inviteCount: number;
  userApiKeyCount: number;
  gatewayRequestCount: number;
  apiKeyCreated?: boolean;
  firstChatCompleted?: boolean;
  dismissedAt?: string | null;
  completedAt?: string | null;
  plan?: string | null;
  isSiteAdmin?: boolean;
  onboardingSegment?: string | null;
};

export type GettingStartedProgress = {
  steps: Record<GettingStartedStepId, boolean>;
  requiredDone: boolean;
  completed: boolean;
  doneCount: number;
  totalCount: number;
  nextStepId: GettingStartedStepId | null;
  planLabel: string;
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

export function isInternalApiKeyName(name: string | null | undefined): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return false;
  if (trimmed === SYSTEM_ASSISTANT_KEY_NAME) return true;
  return trimmed.startsWith("Agent · ");
}

export function workspacePlanLabel(opts: {
  plan?: string | null;
  isSiteAdmin?: boolean | null;
}): string {
  if (opts.isSiteAdmin) return "Admin";
  const plan = (opts.plan || "").trim().toLowerCase();
  if (plan === "unlimited") return "Unlimited";
  return getPlan(opts.plan).name;
}

export function stepCompletion(evidence: OnboardingEvidence): Record<GettingStartedStepId, boolean> {
  return {
    chat: evidence.houseChatUserMessages > 0,
    coworker: evidence.agentCount > 0 || evidence.assistantCount > 0,
    training: evidence.trainingJobCount > 0 || evidence.trainingDatasetCount > 0,
    workflow: evidence.workflowCount > 0,
    studio: evidence.imageRequestCount > 0,
    team: evidence.memberCount > 1 || evidence.inviteCount > 0,
    developer:
      (evidence.userApiKeyCount > 0 || Boolean(evidence.apiKeyCreated)) &&
      (evidence.gatewayRequestCount > 0 || Boolean(evidence.firstChatCompleted)),
  };
}

export function nextRecommendedStepId(
  steps: Record<GettingStartedStepId, boolean>
): GettingStartedStepId | null {
  for (const id of GETTING_STARTED_STEPS) {
    if (!steps[id]) return id;
  }
  return null;
}

export function isGettingStartedComplete(
  steps: Record<GettingStartedStepId, boolean>,
  evidence: Pick<OnboardingEvidence, "dismissedAt">
): boolean {
  if (evidence.dismissedAt) return true;
  return REQUIRED_GETTING_STARTED_STEPS.every((id) => steps[id]);
}

export function shouldShowGettingStarted(
  progress: Pick<GettingStartedProgress, "doneCount" | "totalCount">,
  evidence: Pick<OnboardingEvidence, "dismissedAt">
): boolean {
  return !evidence.dismissedAt && progress.doneCount < progress.totalCount;
}

export function resolveGettingStarted(evidence: OnboardingEvidence): GettingStartedProgress {
  const steps = stepCompletion(evidence);
  const doneCount = GETTING_STARTED_STEPS.filter((id) => steps[id]).length;
  const requiredDone = REQUIRED_GETTING_STARTED_STEPS.every((id) => steps[id]);
  return {
    steps,
    requiredDone,
    completed: isGettingStartedComplete(steps, evidence),
    doneCount,
    totalCount: GETTING_STARTED_STEPS.length,
    nextStepId: nextRecommendedStepId(steps),
    planLabel: workspacePlanLabel(evidence),
  };
}

export function developerStepHref(evidence: Pick<OnboardingEvidence, "userApiKeyCount" | "apiKeyCreated">) {
  if (evidence.userApiKeyCount > 0 || evidence.apiKeyCreated) return "/dashboard/playground";
  return "/dashboard/api-keys";
}

/** Metadata-only complete. Live completion uses resolveGettingStarted. */
export function isChecklistComplete(
  _segment: OnboardingSegment,
  checklist: OnboardingChecklist
): boolean {
  return Boolean(checklist.dismissedAt || checklist.completedAt);
}
