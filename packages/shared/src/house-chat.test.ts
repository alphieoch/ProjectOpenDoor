import { describe, expect, test } from "bun:test";
import {
  formatPeriodWindow,
  getMinutesRemaining,
  getWindowMs,
  houseChatAllowanceForPlan,
  houseChatWindowPooled,
  isWindowExpired,
} from "./house-chat";

describe("house chat windows", () => {
  test("free plan is 5h + weekly", () => {
    expect(houseChatAllowanceForPlan("free")).toEqual({
      periodWindow: "5hour",
      periodMessageLimit: 15,
      weeklyMessageLimit: 40,
      pooled: false,
    });
    expect(getWindowMs("5hour")).toBe(5 * 60 * 60 * 1000);
    expect(getWindowMs("daily")).toBe(24 * 60 * 60 * 1000);
    expect(getWindowMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("student is 20 / 5h per user", () => {
    expect(houseChatAllowanceForPlan("student")).toEqual({
      periodWindow: "5hour",
      periodMessageLimit: 20,
      weeklyMessageLimit: 60,
      pooled: false,
    });
    expect(houseChatWindowPooled("student")).toBe(false);
  });

  test("pro and ultra stay per-user on 5h", () => {
    expect(houseChatAllowanceForPlan("pro").periodMessageLimit).toBe(45);
    expect(houseChatAllowanceForPlan("ultra").periodMessageLimit).toBe(100);
    expect(houseChatWindowPooled("pro")).toBe(false);
  });

  test("null or invalid start is expired so a fresh seat can refill", () => {
    expect(isWindowExpired(null, getWindowMs("5hour")!)).toBe(true);
    expect(isWindowExpired("not-a-date", getWindowMs("5hour")!)).toBe(true);
    expect(isWindowExpired(new Date(Date.now() - 6 * 60 * 60 * 1000), getWindowMs("5hour")!)).toBe(true);
    expect(isWindowExpired(new Date(), getWindowMs("5hour")!)).toBe(false);
  });

  test("countdown and labels", () => {
    expect(formatPeriodWindow("5hour")).toBe("5h");
    expect(formatPeriodWindow("daily")).toBe("24h");
    expect(formatPeriodWindow("weekly")).toBe("week");
    expect(getMinutesRemaining(new Date(), getWindowMs("5hour")!)).toBe(300);
  });
});
