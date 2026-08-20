import { describe, expect, test } from "bun:test";
import {
  activityFromAgent,
  activityFromAudit,
  activityFromHouseChat,
  activityFromRequest,
  activityFromTrainingJob,
  activityFromWorkflowRun,
  auditActivityHref,
  formatActivityWhen,
  isGatewayRequestVisible,
  mergeRecentActivity,
} from "./account-activity";

describe("activity mapping", () => {
  test("maps audit actions to live dashboard routes and skips session noise", () => {
    expect(activityFromAudit({
      id: "login-1",
      action: "user.login",
      createdAt: "2026-08-20T10:00:00.000Z",
      userName: "Alex",
    })).toBeNull();

    const created = activityFromAudit({
      id: "key-1",
      action: "api_key.created",
      createdAt: "2026-08-20T10:01:00.000Z",
      userName: "Alex",
      metadata: { name: "Production" },
    });
    expect(created).toEqual({
      id: "audit:key-1",
      kind: "audit",
      at: "2026-08-20T10:01:00.000Z",
      title: "Created an API key",
      href: "/dashboard/api-keys",
      actor: "Alex",
      detail: "Production",
    });

    expect(auditActivityHref("agent.started", {
      entityId: "agt-1",
      metadata: { runtime: "openbot" },
    })).toBe("/dashboard/openbot/agt-1");
    expect(auditActivityHref("billing.checkout_started")).toBe("/dashboard/billing");
    expect(auditActivityHref("governance.approval.requested")).toBe(
      "/dashboard/governance/approvals"
    );
  });

  test("hides internal agent gateway calls and routes studio vs logs", () => {
    expect(isGatewayRequestVisible("Agent · Leaderbot")).toBe(false);
    expect(isGatewayRequestVisible("Production")).toBe(true);

    expect(activityFromRequest({
      id: "req-agent",
      modelId: "gpt-4.1",
      requestType: "chat",
      status: "success",
      createdAt: "2026-08-20T10:00:00.000Z",
      apiKeyName: "Agent · Leaderbot",
    })).toBeNull();

    const image = activityFromRequest({
      id: "req-img",
      modelId: "imagen-3",
      requestType: "image",
      status: "success",
      createdAt: "2026-08-20T10:02:00.000Z",
      apiKeyName: "Studio",
    });
    expect(image?.href).toBe("/dashboard/studio");
    expect(image?.title).toBe("Generated an image with imagen-3");

    const chat = activityFromRequest({
      id: "req-chat",
      modelId: "gpt-4.1",
      requestType: "chat",
      status: "error",
      createdAt: "2026-08-20T10:03:00.000Z",
      apiKeyName: "Production",
    });
    expect(chat?.href).toBe("/dashboard/logs");
    expect(chat?.actor).toBe("Production");
    expect(chat?.detail).toBe("error");
  });

  test("uses lastUsedAt for agents and finishedAt for training jobs", () => {
    expect(activityFromAgent({
      id: "agt-1",
      name: "Leaderbot",
      runtime: "openbot",
      lastUsedAt: null,
    })).toBeNull();

    const used = activityFromAgent({
      id: "agt-1",
      name: "Leaderbot",
      runtime: "openbot",
      lastUsedAt: "2026-08-20T11:00:00.000Z",
    });
    expect(used?.href).toBe("/dashboard/openbot/agt-1");
    expect(used?.title).toBe("Used Leaderbot");

    const job = activityFromTrainingJob({
      id: "job-1",
      name: "Support tone",
      status: "completed",
      method: "sft",
      baseModelId: "llama-3",
      createdAt: "2026-08-19T09:00:00.000Z",
      updatedAt: "2026-08-19T10:00:00.000Z",
      finishedAt: "2026-08-19T11:00:00.000Z",
    });
    expect(job?.at).toBe("2026-08-19T11:00:00.000Z");
    expect(job?.href).toBe("/dashboard/training");
    expect(job?.title).toBe("Support tone completed");
  });

  test("links workflow runs and house chat to the product pages", () => {
    const run = activityFromWorkflowRun({
      id: "run-1",
      status: "succeeded",
      workflowId: "wf-9",
      workflowName: "Weekly brief",
      createdAt: "2026-08-20T08:00:00.000Z",
      completedAt: "2026-08-20T08:05:00.000Z",
    });
    expect(run?.href).toBe("/dashboard/workflow/wf-9");
    expect(run?.title).toBe("Ran Weekly brief");

    const chat = activityFromHouseChat({
      id: "msg-1",
      chatTitle: "Q3 plan",
      createdAt: "2026-08-20T09:00:00.000Z",
      userName: "Sam",
    });
    expect(chat).toEqual({
      id: "chat:msg-1",
      kind: "chat",
      at: "2026-08-20T09:00:00.000Z",
      title: "Messaged in Q3 plan",
      href: "/dashboard/chat",
      actor: "Sam",
      detail: null,
    });
  });
});

describe("mergeRecentActivity", () => {
  test("keeps the newest ten real events", () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      activityFromHouseChat({
        id: `msg-${index}`,
        createdAt: new Date(Date.parse("2026-08-20T10:00:00.000Z") + index * 60_000).toISOString(),
      })
    );
    const merged = mergeRecentActivity(items, 10);
    expect(merged).toHaveLength(10);
    expect(merged[0]?.id).toBe("chat:msg-11");
    expect(merged[9]?.id).toBe("chat:msg-2");
  });
});

describe("formatActivityWhen", () => {
  const now = Date.parse("2026-08-20T12:00:00.000Z");

  test("uses relative labels for recent events and a real clock time", () => {
    expect(formatActivityWhen("2026-08-20T11:59:20.000Z", now).label).toBe("Just now");
    expect(formatActivityWhen("2026-08-20T11:10:00.000Z", now).label).toBe("50m ago");
    expect(formatActivityWhen("2026-08-20T09:00:00.000Z", now).label).toBe("3h ago");
    const older = formatActivityWhen("2026-08-01T09:00:00.000Z", now);
    expect(older.label).toBe(older.absolute);
    expect(older.absolute.length).toBeGreaterThan(0);
  });
});
