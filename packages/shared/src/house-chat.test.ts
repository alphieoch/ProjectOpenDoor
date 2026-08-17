import { describe, expect, test } from "bun:test";
import {
  formatPeriodWindow,
  getMinutesRemaining,
  getWindowMs,
  houseChatAllowanceForPlan,
  isWindowExpired,
} from "./house-chat";

describe("house chat windows", () => {
  test("free plan is 4h + weekly", () => {
    expect(houseChatAllowanceForPlan("free")).toEqual({
      periodWindow: "4hour",
      periodMessageLimit: 15,
      weeklyMessageLimit: 40,
    });
    expect(getWindowMs("4hour")).toBe(4 * 60 * 60 * 1000);
    expect(getWindowMs("daily")).toBe(24 * 60 * 60 * 1000);
    expect(getWindowMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("null or invalid start is expired so a fresh seat can refill", () => {
    expect(isWindowExpired(null, getWindowMs("4hour")!)).toBe(true);
    expect(isWindowExpired("not-a-date", getWindowMs("4hour")!)).toBe(true);
    expect(isWindowExpired(new Date(Date.now() - 5 * 60 * 60 * 1000), getWindowMs("4hour")!)).toBe(true);
    expect(isWindowExpired(new Date(), getWindowMs("4hour")!)).toBe(false);
  });

  test("countdown and labels", () => {
    expect(formatPeriodWindow("4hour")).toBe("4h");
    expect(formatPeriodWindow("daily")).toBe("24h");
    expect(formatPeriodWindow("weekly")).toBe("week");
    expect(getMinutesRemaining(new Date(), getWindowMs("4hour")!)).toBe(240);
  });
});
