import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("OpenBot channel rail", () => {
  test("OpenBot layouts mount the shell rail (not hidden by hostedInDashboard)", () => {
    const dir = import.meta.dir;
    const shell = readFileSync(join(dir, "shell.tsx"), "utf8");
    const rail = readFileSync(join(dir, "rail.tsx"), "utf8");
    const layout = readFileSync(join(dir, "../../app/dashboard/openbot/layout.tsx"), "utf8");

    expect(layout).toContain("OpenBotShell");
    expect(shell).toContain("OpenBotRail");
    expect(shell).toContain("hostedInDashboard: true");
    expect(shell).toContain("hidden h-full min-h-0 shrink-0 self-stretch md:flex");
    expect(rail).toContain('aria-label="OpenBot channels"');
    expect(rail).toContain("House");
    expect(rail).toContain("Skills");
    expect(rail).toContain("Agents");
    expect(rail).toContain("{!hostedInDashboard && expanded ? (");
    expect(rail).toContain("ThemeToggle");
    expect(rail).toContain("initialsFromName(displayName)");
  });
});
