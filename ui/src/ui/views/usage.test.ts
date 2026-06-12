/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderUsage } from "./usage.ts";
import type { UsageProps } from "./usageTypes.ts";

const noop = vi.fn();

function createUsageProps(overrides: Partial<UsageProps> = {}): UsageProps {
  return {
    data: {
      loading: false,
      error: null,
      sessions: [],
      agents: [],
      sessionsLimitReached: false,
      totals: null,
      aggregates: null,
      costDaily: [],
    },
    filters: {
      startDate: "2026-05-14",
      endDate: "2026-05-14",
      selectedSessions: [],
      selectedDays: [],
      selectedHours: [],
      agentId: null,
      query: "",
      queryDraft: "",
      timeZone: "local",
    },
    display: {
      chartMode: "tokens",
      dailyChartMode: "total",
      sessionSort: "tokens",
      sessionSortDir: "desc",
      recentSessions: [],
      sessionsTab: "all",
      visibleColumns: [],
      contextExpanded: false,
      headerPinned: false,
    },
    detail: {
      timeSeriesMode: "cumulative",
      timeSeriesBreakdownMode: "total",
      timeSeries: null,
      timeSeriesLoading: false,
      timeSeriesCursorStart: null,
      timeSeriesCursorEnd: null,
      sessionLogs: null,
      sessionLogsLoading: false,
      sessionLogsExpanded: false,
      logFilters: {
        roles: [],
        tools: [],
        hasTools: false,
        query: "",
      },
    },
    callbacks: {
      filters: {
        onStartDateChange: noop,
        onEndDateChange: noop,
        onAgentChange: noop,
        onRefresh: noop,
        onTimeZoneChange: noop,
        onToggleHeaderPinned: noop,
        onSelectDay: noop,
        onSelectHour: noop,
        onClearDays: noop,
        onClearHours: noop,
        onClearSessions: noop,
        onClearFilters: noop,
        onQueryDraftChange: noop,
        onApplyQuery: noop,
        onClearQuery: noop,
      },
      display: {
        onChartModeChange: noop,
        onDailyChartModeChange: noop,
        onSessionSortChange: noop,
        onSessionSortDirChange: noop,
        onSessionsTabChange: noop,
        onToggleColumn: noop,
      },
      details: {
        onToggleContextExpanded: noop,
        onToggleSessionLogsExpanded: noop,
        onLogFilterRolesChange: noop,
        onLogFilterToolsChange: noop,
        onLogFilterHasToolsChange: noop,
        onLogFilterQueryChange: noop,
        onLogFilterClear: noop,
        onSelectSession: noop,
        onTimeSeriesModeChange: noop,
        onTimeSeriesBreakdownChange: noop,
        onTimeSeriesCursorRangeChange: noop,
      },
    },
    ...overrides,
  };
}

describe("renderUsage", () => {
  it("omits the duplicate inner page heading because the shell owns tab headings", () => {
    const container = document.createElement("div");

    render(renderUsage(createUsageProps()), container);

    expect(container.querySelector(".usage-page-header")).toBeNull();
    expect(container.querySelector(".usage-page-title")).toBeNull();
    expect(container.querySelector(".usage-header")).not.toBeNull();
  });

  it("shows configured agents in the agent scope filter before usage sessions load", () => {
    const container = document.createElement("div");

    render(
      renderUsage(
        createUsageProps({
          data: {
            ...createUsageProps().data,
            agents: ["main", "research"],
            sessions: [
              {
                key: "agent:main:main",
                agentId: "main",
                updatedAt: Date.now(),
                usage: null,
              } as UsageProps["data"]["sessions"][number],
            ],
          },
        }),
      ),
      container,
    );

    expect(container.querySelector(".usage-select")?.textContent).toContain("main");
    expect(container.querySelector(".usage-select")?.textContent).toContain("research");
  });

  it("filters visible sessions when an agent scope is selected", () => {
    const container = document.createElement("div");

    render(
      renderUsage(
        createUsageProps({
          data: {
            ...createUsageProps().data,
            agents: ["main", "research"],
            sessions: [
              {
                key: "agent:main:main",
                agentId: "main",
                updatedAt: Date.now(),
                usage: {
                  input: 10,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 10,
                  totalCost: 0,
                  inputCost: 0,
                  outputCost: 0,
                  cacheReadCost: 0,
                  cacheWriteCost: 0,
                  missingCostEntries: 0,
                } as UsageProps["data"]["sessions"][number]["usage"],
              } as UsageProps["data"]["sessions"][number],
              {
                key: "agent:research:main",
                agentId: "research",
                updatedAt: Date.now(),
                usage: {
                  input: 20,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 20,
                  totalCost: 0,
                  inputCost: 0,
                  outputCost: 0,
                  cacheReadCost: 0,
                  cacheWriteCost: 0,
                  missingCostEntries: 0,
                } as UsageProps["data"]["sessions"][number]["usage"],
              } as UsageProps["data"]["sessions"][number],
            ],
          },
          filters: {
            ...createUsageProps().filters,
            agentId: "research",
          },
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("agent:research:main");
    expect(container.textContent).not.toContain("agent:main:main");
  });
});
