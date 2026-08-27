import { describe, expect, test } from "bun:test";
import { HOUSE_MANAGEMENT_DEFAULT, readHouseManagement, withHouseManagement } from "./openbot-settings";

describe("OpenBot house management setting", () => {
  test("defaults on when metadata is missing", () => {
    expect(HOUSE_MANAGEMENT_DEFAULT).toBe(true);
    expect(readHouseManagement(null)).toBe(true);
    expect(readHouseManagement({})).toBe(true);
    expect(readHouseManagement({ openbot: {} })).toBe(true);
  });

  test("persists an explicit off flag without dropping other metadata", () => {
    const next = withHouseManagement({ sector: "health" }, false);
    expect(readHouseManagement(next)).toBe(false);
    expect((next as { sector?: string }).sector).toBe("health");
    expect(readHouseManagement(withHouseManagement(next, true))).toBe(true);
  });
});
