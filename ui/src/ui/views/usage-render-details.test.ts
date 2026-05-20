/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, it, expect, vi } from "vitest";
import {
  computeFilteredUsage,
  CHART_BAR_WIDTH_RATIO,
  CHART_MAX_BAR_WIDTH,
  renderContextPanel,
} from "./usage-render-details.ts";
import type { TimeSeriesPoint, UsageSessionEntry } from "./usageTypes.ts";

function makePoint(overrides: Partial<TimeSeriesPoint> = {}): TimeSeriesPoint {
  return {
    timestamp: 1000,
    totalTokens: 100,
    cost: 0.01,
    input: 30,
    output: 40,
    cacheRead: 20,
    cacheWrite: 10,
    cumulativeTokens: 0,
    cumulativeCost: 0,
    ...overrides,
  };
}

const baseUsage = {
  totalTokens: 1000,
  totalCost: 1.0,
  input: 300,
  output: 400,
  cacheRead: 200,
  cacheWrite: 100,
  inputCost: 0.3,
  outputCost: 0.4,
  cacheReadCost: 0.2,
  cacheWriteCost: 0.1,
  durationMs: 60000,
  firstActivity: 0,
  lastActivity: 60000,
  missingCostEntries: 0,
  messageCounts: {
    total: 10,
    user: 5,
    assistant: 5,
    toolCalls: 0,
    toolResults: 0,
    errors: 0,
  },
} satisfies NonNullable<UsageSessionEntry["usage"]>;

describe("computeFilteredUsage", () => {
  it("returns undefined when no points match the range", () => {
    const points = [makePoint({ timestamp: 1000 }), makePoint({ timestamp: 2000 })];
    const result = computeFilteredUsage(baseUsage, points, 3000, 4000);
    expect(result).toBeUndefined();
  });

  it("aggregates tokens and cost for points within range", () => {
    const points = [
      makePoint({ timestamp: 1000, totalTokens: 100, cost: 0.1 }),
      makePoint({ timestamp: 2000, totalTokens: 200, cost: 0.2 }),
      makePoint({ timestamp: 3000, totalTokens: 300, cost: 0.3 }),
    ];
    const result = computeFilteredUsage(baseUsage, points, 1000, 2000);
    expect(result).toBeDefined();
    expect(result!.totalTokens).toBe(300); // 100 + 200
    expect(result!.totalCost).toBeCloseTo(0.3); // 0.1 + 0.2
  });

  it("handles reversed range (end < start)", () => {
    const points = [
      makePoint({ timestamp: 1000, totalTokens: 50 }),
      makePoint({ timestamp: 2000, totalTokens: 75 }),
    ];
    const result = computeFilteredUsage(baseUsage, points, 2000, 1000);
    expect(result).toBeDefined();
    expect(result!.totalTokens).toBe(125);
  });

  it("counts message types based on input/output presence", () => {
    const points = [
      makePoint({ timestamp: 1000, input: 10, output: 0 }),
      makePoint({ timestamp: 2000, input: 0, output: 20 }),
      makePoint({ timestamp: 3000, input: 5, output: 15 }),
    ];
    const result = computeFilteredUsage(baseUsage, points, 1000, 3000);
    expect(result!.messageCounts!.user).toBe(2); // points with input > 0
    expect(result!.messageCounts!.assistant).toBe(2); // points with output > 0
    expect(result!.messageCounts!.total).toBe(3);
  });

  it("computes duration from first to last filtered point", () => {
    const points = [makePoint({ timestamp: 1000 }), makePoint({ timestamp: 5000 })];
    const result = computeFilteredUsage(baseUsage, points, 1000, 5000);
    expect(result!.durationMs).toBe(4000);
    expect(result!.firstActivity).toBe(1000);
    expect(result!.lastActivity).toBe(5000);
  });

  it("aggregates token types (input, output, cacheRead, cacheWrite)", () => {
    const points = [
      makePoint({ timestamp: 1000, input: 10, output: 20, cacheRead: 30, cacheWrite: 40 }),
      makePoint({ timestamp: 2000, input: 5, output: 15, cacheRead: 25, cacheWrite: 35 }),
    ];
    const result = computeFilteredUsage(baseUsage, points, 1000, 2000);
    expect(result!.input).toBe(15);
    expect(result!.output).toBe(35);
    expect(result!.cacheRead).toBe(55);
    expect(result!.cacheWrite).toBe(75);
  });
});

describe("chart bar sizing", () => {
  it("bar width ratio and max are reasonable", () => {
    expect(CHART_BAR_WIDTH_RATIO).toBeGreaterThan(0);
    expect(CHART_BAR_WIDTH_RATIO).toBeLessThan(1);
    expect(CHART_MAX_BAR_WIDTH).toBeGreaterThan(0);
  });

  it("bars fit within chart width for typical point counts", () => {
    const chartWidth = 366; // typical: 400 - padding.left(30) - padding.right(4)
    // For reasonable point counts (up to ~300), bars should fit
    for (const n of [1, 2, 10, 50, 100, 200]) {
      const slotWidth = chartWidth / n;
      const barWidth = Math.min(
        CHART_MAX_BAR_WIDTH,
        Math.max(1, slotWidth * CHART_BAR_WIDTH_RATIO),
      );
      const barGap = slotWidth - barWidth;
      // Slot-based sizing guarantees total = n * slotWidth = chartWidth
      expect(n * slotWidth).toBeCloseTo(chartWidth);
      // Bar gap is non-negative when slotWidth >= 1 / CHART_BAR_WIDTH_RATIO
      if (slotWidth >= 1 / CHART_BAR_WIDTH_RATIO) {
        expect(barGap).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("renderContextPanel", () => {
  it("preserves full context item names in title attributes", () => {
    const contextWeight = {
      source: "estimate",
      generatedAt: 1,
      systemPrompt: {
        chars: 100,
        projectContextChars: 50,
        nonProjectContextChars: 50,
      },
      injectedWorkspaceFiles: [
        {
          name: "very-long-workspace-file-name-that-should-remain-readable.ts",
          path: "/tmp/very-long-workspace-file-name-that-should-remain-readable.ts",
          missing: false,
          rawChars: 1200,
          injectedChars: 900,
          truncated: false,
        },
      ],
      skills: {
        promptChars: 600,
        entries: [
          {
            name: "very-long-skill-name-that-should-not-break-the-context-panel",
            blockChars: 600,
          },
        ],
      },
      tools: {
        listChars: 100,
        schemaChars: 400,
        entries: [
          {
            name: "very_long_tool_name_that_should_have_a_hover_title",
            summaryChars: 100,
            schemaChars: 400,
          },
        ],
      },
    } satisfies NonNullable<UsageSessionEntry["contextWeight"]>;
    const container = document.createElement("div");

    render(renderContextPanel(contextWeight, baseUsage, false, vi.fn()), container);

    const titles = Array.from(container.querySelectorAll(".context-breakdown-item .mono")).map(
      (node) => node.getAttribute("title"),
    );
    expect(titles).toContain("very-long-skill-name-that-should-not-break-the-context-panel");
    expect(titles).toContain("very_long_tool_name_that_should_have_a_hover_title");
    expect(titles).toContain("very-long-workspace-file-name-that-should-remain-readable.ts");
  });
});
