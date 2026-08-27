import { describe, expect, test } from "bun:test";
import { seedSkills } from "./agent-workspace";
import {
  OPENBOT_SKILL_CATALOG,
  authorSkillOnWorkspace,
  enableCatalogSkill,
  hasSkillNamed,
  parseCustomSkillDraft,
  isOpenBotReservedPathSegment,
  resolveOpenBotSkillTarget,
  skillSlug,
} from "./openbot-skills";

describe("OpenBot skill catalog", () => {
  test("ids are unique and include the seeded OpenBot skills", () => {
    const ids = OPENBOT_SKILL_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["browse-and-report", "decide-then-act", "workspace-files"]));
    expect(ids).toEqual(expect.arrayContaining([
      "cite-sources",
      "extract-tables",
      "draft-email",
      "check-metrics",
      "follow-runbook",
      "screenshot-report",
    ]));
    for (const item of OPENBOT_SKILL_CATALOG) {
      expect(item.body.trim().length).toBeGreaterThan(20);
      expect(item.title.length).toBeGreaterThan(2);
      expect(item.helpsWith.length).toBeGreaterThan(2);
    }
  });

  test("seedSkills(openbot) uses the catalog seed bodies", () => {
    const seeded = seedSkills("openbot");
    expect(seeded.map((skill) => skill.name).sort()).toEqual(
      OPENBOT_SKILL_CATALOG.filter((item) => item.seed).map((item) => item.id).sort(),
    );
    const browse = seeded.find((skill) => skill.name === "browse-and-report");
    expect(browse?.body).toBe(OPENBOT_SKILL_CATALOG.find((item) => item.id === "browse-and-report")?.body);
  });
});

describe("enable catalog skill", () => {
  test("adds a premade skill once and skips duplicates", () => {
    const first = enableCatalogSkill([], "cite-sources", "2026-08-20T00:00:00.000Z");
    expect(first.added).toBe(true);
    expect(first.skill?.name).toBe("cite-sources");
    expect(first.skill?.source).toBe("seed");
    expect(first.skill?.body).toContain("render_component");

    const second = enableCatalogSkill(first.skills, "cite-sources");
    expect(second.added).toBe(false);
    expect(second.skills).toHaveLength(1);
    expect(second.skills[0]?.id).toBe(first.skill?.id);
    expect(hasSkillNamed(second.skills, "Cite-Sources")).toBe(true);
  });

  test("rejects an unknown catalog id", () => {
    const result = enableCatalogSkill([], "not-a-skill");
    expect(result.added).toBe(false);
    expect(result.error).toContain("Unknown skill");
    expect(result.skills).toEqual([]);
  });
});

describe("custom skill draft", () => {
  test("validates and slugs a custom skill, then upserts by name", () => {
    expect(skillSlug("Draft weekly recap")).toBe("draft-weekly-recap");
    expect(parseCustomSkillDraft({ name: "x", instructions: "too short" }).ok).toBe(false);

    const parsed = parseCustomSkillDraft({
      name: "Weekly recap",
      description: "Friday note for the team",
      instructions: "Collect shipped work and write a short recap in /workspace/drafts/recap.md.",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.name).toBe("weekly-recap");
    expect(parsed.body).toContain("Friday note");

    const created = authorSkillOnWorkspace([], {
      name: "Weekly recap",
      description: "Friday note for the team",
      instructions: "Collect shipped work and write a short recap in /workspace/drafts/recap.md.",
    });
    expect(created.added).toBe(true);

    const updated = authorSkillOnWorkspace(created.skills, {
      name: "weekly-recap",
      instructions: "Updated instructions that are long enough to pass validation.",
    });
    expect(updated.added).toBe(false);
    expect(updated.skills).toHaveLength(1);
    expect(updated.skill?.body).toContain("Updated instructions");
    expect(updated.skill?.id).toBe(created.skill?.id);
  });
});

describe("reserved shell paths", () => {
  test("treats agents and skills as rail destinations, not coworker ids", () => {
    expect(isOpenBotReservedPathSegment("agents")).toBe(true);
    expect(isOpenBotReservedPathSegment("skills")).toBe(true);
    expect(isOpenBotReservedPathSegment("lead-1")).toBe(false);
    expect(isOpenBotReservedPathSegment(undefined)).toBe(false);
  });
});

describe("skill target", () => {
  test("uses the open channel, otherwise Leaderbot, otherwise the only coworker", () => {
    const leader = { id: "lead-1", name: "Leaderbot", kind: "leader" as const };
    const research = { id: "r-1", name: "Research" };
    expect(resolveOpenBotSkillTarget([leader, research], "r-1")?.id).toBe("r-1");
    expect(resolveOpenBotSkillTarget([leader, research], "skills")?.id).toBe("lead-1");
    expect(resolveOpenBotSkillTarget([research])?.id).toBe("r-1");
    expect(resolveOpenBotSkillTarget([research, { id: "k-1", name: "Knowledge" }])).toBeUndefined();
  });
});
