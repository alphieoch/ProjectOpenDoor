import { describe, expect, test } from "bun:test";
import {
  capacityGuideRates,
  defaultRentFromUsSku,
  displaySkus,
  ENTERPRISE_CLUSTER_SKU,
  modeToProvision,
  premiumProductFromSelection,
  provisionLabel,
  rentFromUsCta,
  rentalHoursLeft,
  shortGpuLabel,
  specForSku,
} from "./display";

describe("premium display", () => {
  test("maps execution modes to real Cloud Run flags", () => {
    expect(modeToProvision("on-demand")).toEqual({ reserved: true, scaleToZero: false });
    expect(modeToProvision("off-peak")).toEqual({ reserved: false, scaleToZero: true });
    expect(modeToProvision("batch")).toEqual({ reserved: false, scaleToZero: true });
  });

  test("merges live SKUs with spec cards and a non-rentable cluster", () => {
    const rows = displaySkus([
      { sku: "metal", displayName: "Use this Mac (Metal)", hourlyUsd: 0, target: "local" },
      { sku: "nvidia-l4", displayName: "NVIDIA L4", hourlyUsd: 1.29, target: "gcp", regionMultiplier: 1 },
    ]);
    expect(rows.some((r) => r.sku === "metal" && r.rentable && r.vram.includes("Unified"))).toBe(true);
    expect(specForSku("metal").subtitle).toBe("Use this Mac · $0");
    expect(specForSku("metal").recommendedFor.toLowerCase()).not.toContain("rent this mac");
    expect(rows.some((r) => r.sku === "nvidia-l4" && r.hourlyUsd === 1.29)).toBe(true);
    expect(rows.some((r) => r.sku === "nvidia-a100" && r.hourlyUsd === 6.25 && r.rentable)).toBe(true);
    expect(rows.some((r) => r.sku === "nvidia-h100" && r.hourlyUsd === 13.5 && r.rentable)).toBe(true);
    const cluster = rows.find((r) => r.sku === ENTERPRISE_CLUSTER_SKU);
    expect(cluster?.rentable).toBe(false);
  });

  test("empty catalog still prices Rent from OpenDoor L4 / A100 / H100", () => {
    const rows = displaySkus([]);
    expect(rows.find((r) => r.sku === "metal")?.hourlyUsd).toBe(0);
    expect(rows.find((r) => r.sku === "nvidia-l4")?.hourlyUsd).toBe(1.29);
    expect(rows.find((r) => r.sku === "nvidia-a100")?.hourlyUsd).toBe(6.25);
    expect(rows.find((r) => r.sku === "nvidia-h100")?.hourlyUsd).toBe(13.5);
    expect(rows.filter((r) => r.target === "gcp" && r.rentable).map((r) => r.sku)).toEqual([
      "nvidia-l4",
      "nvidia-a100",
      "nvidia-h100",
    ]);
  });

  test("capacity guides are derived from the listed hour, not a fake meter", () => {
    expect(capacityGuideRates(1.29)).toEqual({ onDemand: 1.29, offPeak: 0.77, batch: 0.52 });
  });

  test("hours left stays honest for empty, pending, and elapsed rentals", () => {
    expect(rentalHoursLeft({ hours: null, startedAt: null, status: "active" }).label).toBe("Until you stop");
    expect(rentalHoursLeft({ hours: 12, startedAt: null, status: "pending" }).label).toBe("12h reserved");
    const started = "2026-08-20T00:00:00.000Z";
    const now = Date.parse("2026-08-20T03:15:00.000Z");
    expect(rentalHoursLeft({ hours: 12, startedAt: started, status: "active", now }).label).toBe("8h 45m left");
    expect(rentalHoursLeft({ hours: 1, startedAt: started, status: "active", now }).label).toBe("Time up");
    expect(rentalHoursLeft({ hours: 12, startedAt: started, status: "stopped", now }).label).toBe("Stopped");
  });

  test("hub defaults to Rent from OpenDoor and hides Share unless that tab is selected", () => {
    const rows = displaySkus([]);
    expect(defaultRentFromUsSku(rows)).toBe("nvidia-l4");
    expect(premiumProductFromSelection({ hub: "use", sku: "nvidia-a100", target: "gcp" })).toBe("opendoor");
    expect(premiumProductFromSelection({ hub: "use", sku: "metal", target: "local" })).toBe("self-use");
    expect(premiumProductFromSelection({ hub: "share", sku: "nvidia-l4", target: "gcp" })).toBe("share");
    expect(shortGpuLabel("nvidia-l4")).toBe("L4");
    expect(rentFromUsCta({ sku: "nvidia-l4", hours: 12 })).toBe("Rent L4 (12h)");
    expect(rentFromUsCta({ sku: "nvidia-a100", hours: null })).toBe("Rent A100");
    expect(rentFromUsCta({ sku: ENTERPRISE_CLUSTER_SKU, rentable: false })).toBe("Talk to Support");
  });

  test("provision label uses real deployment flags", () => {
    expect(provisionLabel({ target: "local" })).toBe("Use this Mac");
    expect(provisionLabel({ target: "local", hostShareId: "listing-1" })).toBe("Shared host");
    expect(provisionLabel({ target: "gcp", reserved: true, scaleToZero: false })).toBe("On-demand reserved");
    expect(provisionLabel({ target: "gcp", reserved: false, scaleToZero: true })).toBe("Scale-to-zero");
  });
});
