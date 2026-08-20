import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dir;
const repoRoot = join(here, "../../..");

function readSrc(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function readRepo(rel: string) {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("client import graph stays off Vertex rag-search", () => {
  test("shared barrel exports the search contract, not rag-search.ts", () => {
    const barrel = readSrc("index.ts");
    expect(barrel).toContain("./rag-search-contract.js");
    expect(barrel).toContain("WEB_SEARCH_TOOL_NAME");
    expect(barrel).toContain("formatRagSearchDisplay");
    expect(barrel).not.toContain("rag-search.ts");
    expect(barrel).not.toMatch(/from ["']\.\/rag-search\.js["']/);
    expect(barrel).not.toContain("agent-execute");
    expect(barrel).not.toContain("agent-tools");
    expect(barrel).not.toMatch(/export \* from ["']\.\/rag-search["']/);
  });

  test("agent-tools types do not import rag-search execution", () => {
    const src = readSrc("agent-tools.ts");
    expect(src).toContain("rag-search-contract");
    expect(src).not.toContain("rag-search.ts");
    expect(src).not.toMatch(/from ["']\.\/rag-search\.js["']/);
    expect(src).not.toMatch(/from ["']\.\/rag-search["']/);
    expect(src).not.toContain("child_process");
    expect(src).not.toContain("promisify");
    expect(src).not.toMatch(/\bexecuteTool\b/);
    expect(src).not.toMatch(/\bragSearch\b/);
  });

  test("dashboard sidebar, personas, and barrel consumers do not import execution", () => {
    const files = [
      "apps/dashboard/src/components/ui/dashboard-sidebar.tsx",
      "apps/dashboard/src/lib/openbot-personas.ts",
      "apps/dashboard/src/components/openbot/use-openbot-workspace.ts",
      "apps/dashboard/src/components/openbot/settings-dialog.tsx",
    ];
    for (const file of files) {
      const src = readRepo(file);
      expect(src).not.toMatch(/rag-search/);
      expect(src).not.toMatch(/@opendoor\/shared\/rag-search/);
      expect(src).not.toMatch(/@opendoor\/shared\/agent-execute/);
      expect(src).not.toMatch(/\bexecuteTool\b/);
      expect(src).not.toMatch(/\bragSearch\b/);
    }
  });
});
