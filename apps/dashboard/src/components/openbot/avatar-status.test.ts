import { describe, expect, test } from "bun:test";
import { avatarVisual, avatarVisualLabel } from "./avatar-status";

describe("avatarVisual", () => {
  test("maps a running or booting agent to the orbiting ring", () => {
    expect(avatarVisual({ status: "running" })).toBe("working");
    expect(avatarVisual({ status: "starting", computerStatus: "ready" })).toBe("working");
    expect(avatarVisual({ status: "pending" })).toBe("working");
    expect(avatarVisual({ status: "streaming" })).toBe("working");
    expect(avatarVisual({ status: "thinking" })).toBe("working");
  });

  test("prefers a computer help request over a running lifecycle", () => {
    expect(avatarVisual({ status: "running", computerStatus: "help_requested" })).toBe("needs-you");
    expect(avatarVisual({ status: "waiting" })).toBe("needs-you");
  });

  test("keeps a failed agent on the destructive ring", () => {
    expect(avatarVisual({ status: "failed" })).toBe("error");
    expect(avatarVisual({ status: "error" })).toBe("error");
  });

  test("stays calm when idle, stopped, or the human has the wheel", () => {
    expect(avatarVisual({ status: "stopped" })).toBe("idle");
    expect(avatarVisual({ status: "idle", computerStatus: "ready" })).toBe("idle");
    expect(avatarVisual({})).toBe("idle");
    expect(avatarVisual({ status: "running", computerStatus: "human_driving" })).toBe("idle");
  });

  test("labels the ring for assistive text", () => {
    expect(avatarVisualLabel("needs-you")).toBe("needs you");
    expect(avatarVisualLabel("working")).toBe("working");
  });
});
