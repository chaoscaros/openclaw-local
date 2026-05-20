/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderOverviewCards, type OverviewCardsProps } from "./overview-cards.ts";

function createOverviewCardsProps(overrides: Partial<OverviewCardsProps> = {}): OverviewCardsProps {
  return {
    usageResult: null,
    sessionsResult: null,
    skillsReport: null,
    cronJobs: [],
    cronStatus: null,
    presenceCount: 0,
    onNavigate: vi.fn(),
    ...overrides,
  };
}

describe("renderOverviewCards", () => {
  it("renders recent session names through the shared display resolver", () => {
    const container = document.createElement("div");

    render(
      renderOverviewCards(
        createOverviewCardsProps({
          sessionsResult: {
            ts: 0,
            path: "",
            count: 3,
            defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: null },
            sessions: [
              {
                key: "discord:123:456",
                kind: "direct",
                label: "   ",
                displayName: "Ops Room",
                model: "gpt-5",
                updatedAt: null,
              },
              {
                key: "telegram:123:456",
                kind: "direct",
                label: "telegram:123:456",
                model: "gpt-5",
                updatedAt: null,
              },
              {
                key: "agent:main:main",
                kind: "direct",
                label: "Main Project",
                displayName: "agent:main:main",
                model: "gpt-5",
                updatedAt: null,
              },
            ],
          },
        }),
      ),
      container,
    );

    const recentNames = [...container.querySelectorAll(".ov-recent__key")].map(
      (node) => node.textContent?.trim() ?? "",
    );
    expect(recentNames).toEqual(["Ops Room", "Telegram Session", "Main Project"]);
    expect(recentNames).not.toContain("telegram:123:456");
  });
});
