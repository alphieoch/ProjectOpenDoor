import { describe, expect, test } from "bun:test";
import {
  GETTING_STARTED_CATALOG,
  GETTING_STARTED_STEPS,
  developerStepHref,
  isChecklistComplete,
  isGettingStartedComplete,
  isInternalApiKeyName,
  nextRecommendedStepId,
  resolveGettingStarted,
  shouldShowGettingStarted,
  stepCompletion,
  workspacePlanLabel,
  type OnboardingEvidence,
} from "./onboarding";

function evidence(overrides: Partial<OnboardingEvidence> = {}): OnboardingEvidence {
  return {
    houseChatUserMessages: 0,
    agentCount: 0,
    assistantCount: 0,
    trainingJobCount: 0,
    trainingDatasetCount: 0,
    workflowCount: 0,
    imageRequestCount: 0,
    memberCount: 1,
    inviteCount: 0,
    userApiKeyCount: 0,
    gatewayRequestCount: 0,
    ...overrides,
  };
}

describe("getting started completion", () => {
  test("detects house chat, coworkers, and optional build steps from live counts", () => {
    const empty = stepCompletion(evidence());
    expect(empty.chat).toBe(false);
    expect(empty.coworker).toBe(false);
    expect(empty.training).toBe(false);
    expect(empty.workflow).toBe(false);
    expect(empty.studio).toBe(false);
    expect(empty.team).toBe(false);
    expect(empty.developer).toBe(false);

    const live = stepCompletion(
      evidence({
        houseChatUserMessages: 2,
        agentCount: 1,
        trainingJobCount: 1,
        workflowCount: 1,
        imageRequestCount: 1,
        memberCount: 2,
        userApiKeyCount: 1,
        gatewayRequestCount: 3,
      })
    );
    expect(live.chat).toBe(true);
    expect(live.coworker).toBe(true);
    expect(live.training).toBe(true);
    expect(live.workflow).toBe(true);
    expect(live.studio).toBe(true);
    expect(live.team).toBe(true);
    expect(live.developer).toBe(true);
  });

  test("treats an AI assistant as a coworker and a pending invite as a team step", () => {
    expect(stepCompletion(evidence({ assistantCount: 1 })).coworker).toBe(true);
    expect(stepCompletion(evidence({ inviteCount: 1 })).team).toBe(true);
    expect(stepCompletion(evidence({ trainingDatasetCount: 1 })).training).toBe(true);
  });

  test("developer step needs a user key and a real playground or gateway request", () => {
    expect(stepCompletion(evidence({ userApiKeyCount: 1 })).developer).toBe(false);
    expect(stepCompletion(evidence({ firstChatCompleted: true })).developer).toBe(false);
    expect(
      stepCompletion(evidence({ userApiKeyCount: 1, firstChatCompleted: true })).developer
    ).toBe(true);
    expect(
      stepCompletion(evidence({ apiKeyCreated: true, gatewayRequestCount: 1 })).developer
    ).toBe(true);
  });

  test("required path is chat plus coworker; old API-key checklist does not finish setup", () => {
    const stuckOnGateway = resolveGettingStarted(
      evidence({ apiKeyCreated: true, firstChatCompleted: false })
    );
    expect(stuckOnGateway.completed).toBe(false);
    expect(stuckOnGateway.requiredDone).toBe(false);
    expect(stuckOnGateway.nextStepId).toBe("chat");
    expect(isChecklistComplete("standard", { apiKeyCreated: true, firstChatCompleted: true })).toBe(
      false
    );

    const coreDone = resolveGettingStarted(
      evidence({ houseChatUserMessages: 1, agentCount: 1 })
    );
    expect(coreDone.requiredDone).toBe(true);
    expect(coreDone.completed).toBe(true);
    expect(coreDone.nextStepId).toBe("training");
  });

  test("keeps the checklist visible until every step is done or the user hides it", () => {
    const coreOnly = resolveGettingStarted(evidence({ houseChatUserMessages: 1, agentCount: 1 }));
    expect(shouldShowGettingStarted(coreOnly, {})).toBe(true);
    expect(shouldShowGettingStarted(coreOnly, { dismissedAt: "2026-08-20T00:00:00.000Z" })).toBe(false);
    const allDone = resolveGettingStarted(
      evidence({
        houseChatUserMessages: 1,
        agentCount: 1,
        trainingJobCount: 1,
        workflowCount: 1,
        imageRequestCount: 1,
        memberCount: 3,
        userApiKeyCount: 1,
        gatewayRequestCount: 1,
      })
    );
    expect(shouldShowGettingStarted(allDone, {})).toBe(false);
  });

  test("dismissing setup completes getting started without inventing usage", () => {
    const dismissed = resolveGettingStarted(evidence({ dismissedAt: "2026-08-20T00:00:00.000Z" }));
    expect(dismissed.completed).toBe(true);
    expect(dismissed.requiredDone).toBe(false);
    expect(
      isGettingStartedComplete(stepCompletion(evidence()), { dismissedAt: "2026-08-20T00:00:00.000Z" })
    ).toBe(true);
  });

  test("recommends the first incomplete step in product order", () => {
    expect(nextRecommendedStepId(stepCompletion(evidence()))).toBe("chat");
    expect(
      nextRecommendedStepId(
        stepCompletion(evidence({ houseChatUserMessages: 1, agentCount: 1, workflowCount: 1 }))
      )
    ).toBe("training");
    const all = stepCompletion(
      evidence({
        houseChatUserMessages: 1,
        agentCount: 1,
        trainingJobCount: 1,
        workflowCount: 1,
        imageRequestCount: 1,
        memberCount: 3,
        userApiKeyCount: 1,
        gatewayRequestCount: 1,
      })
    );
    expect(nextRecommendedStepId(all)).toBeNull();
  });
});

describe("plan label and developer links", () => {
  test("maps the real plan instead of leftover Standard segment", () => {
    expect(workspacePlanLabel({ plan: "free" })).toBe("Starter Free");
    expect(workspacePlanLabel({ plan: "pro" })).toBe("Pro Studio");
    expect(workspacePlanLabel({ plan: "enterprise" })).toBe("Enterprise");
    expect(workspacePlanLabel({ plan: "unlimited" })).toBe("Unlimited");
    expect(workspacePlanLabel({ plan: "free", isSiteAdmin: true })).toBe("Admin");
    expect(workspacePlanLabel({ plan: "standard" })).toBe("Starter Free");
  });

  test("sends developers to keys first, then playground once a key exists", () => {
    expect(developerStepHref({ userApiKeyCount: 0 })).toBe("/dashboard/api-keys");
    expect(developerStepHref({ userApiKeyCount: 1 })).toBe("/dashboard/playground");
    expect(developerStepHref({ userApiKeyCount: 0, apiKeyCreated: true })).toBe(
      "/dashboard/playground"
    );
  });

  test("ignores provisioned agent and system assistant keys", () => {
    expect(isInternalApiKeyName("__opendoor_system_assistants__")).toBe(true);
    expect(isInternalApiKeyName("Agent · Leaderbot")).toBe(true);
    expect(isInternalApiKeyName("Production")).toBe(false);
  });

  test("every catalog step points at a live dashboard route", () => {
    for (const id of GETTING_STARTED_STEPS) {
      expect(GETTING_STARTED_CATALOG[id].href.startsWith("/dashboard/")).toBe(true);
    }
  });
});
