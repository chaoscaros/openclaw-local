import { describe, expect, it } from "vitest";
import {
  filterCronTemplateGroups,
  findCronTemplateById,
  getCronTemplateGroups,
} from "./cron-templates.ts";

describe("cron templates", () => {
  it("returns grouped templates for the cron automation picker", () => {
    const groups = getCronTemplateGroups();
    expect(groups.length).toBeGreaterThanOrEqual(4);
    expect(groups.flatMap((group) => group.templates).length).toBeGreaterThanOrEqual(8);
  });

  it("finds the daily git standup template with an agent-turn payload", () => {
    const template = findCronTemplateById("daily-git-standup");
    expect(template).not.toBeNull();
    expect(template?.defaultFormPatch.payloadKind).toBe("agentTurn");
    expect(template?.defaultFormPatch.payloadText).toContain("git 活动");
    expect(template?.scheduleSummary).toBeTruthy();
  });

  it("filters templates by query and risk", () => {
    const filtered = filterCronTemplateGroups({ query: "CI", risk: "safe" });
    const ids = filtered.flatMap((group) => group.templates.map((template) => template.id));
    expect(ids).toContain("ci-failure-triage");
    expect(ids).not.toContain("weekly-release-notes");
  });
});
