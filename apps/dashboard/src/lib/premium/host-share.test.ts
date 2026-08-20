import { describe, expect, test } from "bun:test";
import {
  SHARE_MIN_APPLE_UNIFIED_GB,
  clampSharedHourlyUsd,
  earningsCentsForElapsed,
  evaluateHostShareEligibility,
  formatEarningsUsd,
  useVsShareCopy,
  type HostShareCapabilities,
} from "./host-share";

function cap(partial: Partial<HostShareCapabilities>): HostShareCapabilities {
  return {
    appleSilicon: false,
    gpuName: null,
    chip: null,
    memoryGb: null,
    gpuMemoryGb: null,
    usableMemoryGb: null,
    ollamaInstalled: false,
    ollamaRunning: false,
    studioLive: false,
    ...partial,
  };
}

describe("use vs share labeling", () => {
  test("self-use is Use this Mac at $0, never Rent This Mac", () => {
    const copy = useVsShareCopy("self-use");
    expect(copy.title).toBe("Use this Mac");
    expect(copy.sku).toBe("Use this Mac (Metal)");
    expect(copy.verb).toBe("Use this Mac");
    expect(copy.rateNote).toContain("$0");
    expect(`${copy.title} ${copy.verb}`.toLowerCase()).not.toContain("rent this mac");
  });

  test("share and renter lanes use listed-host language", () => {
    expect(useVsShareCopy("share").title).toBe("Share your GPU");
    expect(useVsShareCopy("share").rateNote).toContain("earn");
    expect(useVsShareCopy("shared-rental").verb).toBe("Rent listed host");
  });

  test("opendoor lane is Rent from OpenDoor on the renter's GCP project", () => {
    const copy = useVsShareCopy("opendoor");
    expect(copy.title).toBe("Rent from OpenDoor");
    expect(copy.rateNote.toLowerCase()).toContain("gcp");
    expect(copy.verb).toContain("Rent");
  });
});

describe("host share eligibility", () => {
  test("rejects a machine with no GPU", () => {
    const verdict = evaluateHostShareEligibility(cap({ studioLive: true }));
    expect(verdict.eligible).toBe(false);
    expect(verdict.hasAccelerator).toBe(false);
    expect(verdict.reasons[0]).toMatch(/No Apple Silicon or discrete GPU/i);
  });

  test("rejects a weak Apple Silicon Mac even if Studio is up", () => {
    const verdict = evaluateHostShareEligibility(
      cap({
        appleSilicon: true,
        chip: "Apple M2",
        usableMemoryGb: 8,
        studioLive: true,
      }),
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.memoryOk).toBe(false);
    expect(verdict.reasons.join(" ")).toContain(String(SHARE_MIN_APPLE_UNIFIED_GB));
  });

  test("rejects a powerful Mac when the worker is down", () => {
    const verdict = evaluateHostShareEligibility(
      cap({
        appleSilicon: true,
        usableMemoryGb: 64,
        ollamaInstalled: true,
        ollamaRunning: false,
        studioLive: false,
      }),
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.workerUp).toBe(false);
    expect(verdict.reasons.join(" ")).toMatch(/Studio or Ollama/i);
  });

  test("accepts Apple Silicon with enough unified memory and a live worker", () => {
    const verdict = evaluateHostShareEligibility(
      cap({
        appleSilicon: true,
        chip: "Apple M2 Ultra",
        usableMemoryGb: 64,
        ollamaRunning: true,
      }),
    );
    expect(verdict.eligible).toBe(true);
    expect(verdict.workerKind).toBe("ollama");
    expect(verdict.label).toContain("Apple Silicon");
    expect(verdict.label).toContain("64 GB");
  });

  test("accepts a discrete GPU with enough VRAM and Studio", () => {
    const verdict = evaluateHostShareEligibility(
      cap({
        gpuName: "NVIDIA RTX 4090",
        gpuMemoryGb: 24,
        studioLive: true,
      }),
    );
    expect(verdict.eligible).toBe(true);
    expect(verdict.workerKind).toBe("studio");
    expect(verdict.label).toContain("4090");
  });
});

describe("shared Metal pricing and earnings", () => {
  test("clamps listed hourly to a real marketplace band", () => {
    expect(clampSharedHourlyUsd(0)).toBe(0.25);
    expect(clampSharedHourlyUsd(0.8)).toBe(0.8);
    expect(clampSharedHourlyUsd(99)).toBe(4);
    expect(clampSharedHourlyUsd(Number.NaN)).toBe(0.8);
  });

  test("earnings are floor cents from elapsed listed hours", () => {
    const start = "2026-08-20T00:00:00.000Z";
    expect(earningsCentsForElapsed(0.8, start, "2026-08-20T00:00:00.000Z")).toBe(0);
    expect(earningsCentsForElapsed(0.8, start, "2026-08-20T01:00:00.000Z")).toBe(80);
    expect(earningsCentsForElapsed(0.8, start, "2026-08-20T00:30:00.000Z")).toBe(40);
    expect(formatEarningsUsd(80)).toBe("$0.80");
  });
});
