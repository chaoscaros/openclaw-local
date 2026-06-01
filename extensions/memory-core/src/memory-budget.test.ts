import { describe, expect, it } from "vitest";
import { compactMemoryForBudget, DEFAULT_MEMORY_FILE_MAX_CHARS } from "./memory-budget.js";

function promotionSection(date: string, sizeChars: number): string {
  const heading = `## Promoted From Short-Term Memory (${date})\n`;
  const padding = "x".repeat(Math.max(0, sizeChars - heading.length));
  return `${heading}${padding}`;
}

describe("compactMemoryForBudget", () => {
  it("returns existing memory unchanged when total fits the budget", () => {
    const existing = "# Long-Term Memory\n\nSome content.\n";
    const newSection = "\n## Promoted From Short-Term Memory (2026-04-29)\n- entry\n";
    const result = compactMemoryForBudget({
      existingMemory: existing,
      newSection,
      budgetChars: 1_000,
    });
    expect(result.compacted).toBe(existing);
    expect(result.droppedDates).toEqual([]);
  });

  it("drops the oldest promotion section first when over budget", () => {
    const oldest = promotionSection("2026-04-10", 500);
    const newer = promotionSection("2026-04-20", 500);
    const existing = `${oldest}\n${newer}`;
    const newSection = `\n${promotionSection("2026-04-29", 500)}`;
    const result = compactMemoryForBudget({
      existingMemory: existing,
      newSection,
      budgetChars: 1_200,
    });
    expect(result.droppedDates).toEqual(["2026-04-10"]);
    expect(result.compacted).not.toContain("(2026-04-10)");
    expect(result.compacted).toContain("(2026-04-20)");
  });

  it("preserves user-authored content", () => {
    const userSection = "## My Notes\n\nImportant user content.\n";
    const oldest = promotionSection("2026-04-10", 800);
    const existing = `# Long-Term Memory\n\n${userSection}\n${oldest}`;
    const newSection = `\n${promotionSection("2026-04-29", 600)}`;
    const result = compactMemoryForBudget({
      existingMemory: existing,
      newSection,
      budgetChars: 800,
    });
    expect(result.droppedDates).toContain("2026-04-10");
    expect(result.compacted).toContain("## My Notes");
    expect(result.compacted).toContain("Important user content.");
    expect(result.compacted).toContain("# Long-Term Memory");
  });

  it("drops every promotion section when budget cannot be satisfied otherwise", () => {
    const existing = [
      promotionSection("2026-04-10", 600),
      promotionSection("2026-04-15", 600),
      promotionSection("2026-04-20", 600),
    ].join("\n");
    const newSection = `\n${promotionSection("2026-04-29", 600)}`;
    const result = compactMemoryForBudget({
      existingMemory: existing,
      newSection,
      budgetChars: 700,
    });
    expect(result.droppedDates).toEqual(["2026-04-10", "2026-04-15", "2026-04-20"]);
    expect(result.compacted).not.toContain("Promoted From Short-Term Memory");
  });

  it("returns existing unchanged when there are no promotion sections", () => {
    const existing = "# Long-Term Memory\n\nLots of user content here.\n".repeat(50);
    const newSection = `\n${promotionSection("2026-04-29", 200)}`;
    const result = compactMemoryForBudget({
      existingMemory: existing,
      newSection,
      budgetChars: 500,
    });
    expect(result.compacted).toBe(existing);
    expect(result.droppedDates).toEqual([]);
  });

  it("does not prepend a spurious leading newline when input starts with a promotion heading", () => {
    const existing = `${promotionSection("2026-04-10", 200)}\n${promotionSection("2026-04-20", 200)}`;
    const newSection = `\n${promotionSection("2026-04-29", 200)}`;
    const result = compactMemoryForBudget({
      existingMemory: existing,
      newSection,
      budgetChars: 500,
    });
    expect(result.compacted.startsWith("\n")).toBe(false);
    expect(result.compacted.startsWith("## Promoted From Short-Term Memory")).toBe(true);
  });

  it("respects writer overhead reserve so on-disk size stays inside the budget", () => {
    const existing = `${promotionSection("2026-04-10", 1_000)}\n${promotionSection("2026-04-20", 1_000)}`;
    const newSection = `\n${promotionSection("2026-04-29", 1_000)}`;
    const budget = 2_000;
    const result = compactMemoryForBudget({
      existingMemory: existing,
      newSection,
      budgetChars: budget,
    });
    const headerOverhead = 20;
    const trailingNewline = 1;
    expect(
      result.compacted.length + newSection.length + headerOverhead + trailingNewline,
    ).toBeLessThanOrEqual(budget);
  });

  it("exposes a sane default below the bootstrap injection cap", () => {
    expect(DEFAULT_MEMORY_FILE_MAX_CHARS).toBeLessThan(12_000);
    expect(DEFAULT_MEMORY_FILE_MAX_CHARS).toBeGreaterThan(0);
  });
});
