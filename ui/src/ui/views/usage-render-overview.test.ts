/* @vitest-environment jsdom */

import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderDailyChartCompact } from "./usage-render-overview.ts";
import type { CostDailyEntry, UsageTotals } from "./usageTypes.ts";

const totals: UsageTotals = {
  input: 100,
  output: 200,
  cacheRead: 50,
  cacheWrite: 25,
  totalTokens: 375,
  inputCost: 0.1,
  outputCost: 0.2,
  cacheReadCost: 0.03,
  cacheWriteCost: 0.02,
  totalCost: 0.35,
  missingCostEntries: 0,
};

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function mockTooltipRect(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.classList.contains("daily-bar-tooltip--floating")) {
        return rect(0, 0, width, height);
      }
      return rect(0, 0, 0, 0);
    },
  );
}

function mockElementRect(
  element: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect(left, top, width, height),
  });
}

function dailyEntry(date: string, totalTokens: number, totalCost = 0): CostDailyEntry {
  return {
    ...totals,
    date,
    input: totalTokens,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens,
    totalCost,
  };
}

function renderDailyChart(
  daily: CostDailyEntry[],
  onSelectDay = vi.fn<(day: string, shiftKey: boolean) => void>(),
) {
  const container = document.createElement("div");
  document.body.append(container);
  render(
    renderDailyChartCompact(daily, [], "tokens", "total", () => {}, onSelectDay),
    container,
  );
  return {
    container,
    onSelectDay,
    bars: Array.from(container.querySelectorAll<HTMLElement>(".daily-bar-wrapper")),
  };
}

function getFloatingTooltip(): HTMLElement | null {
  return document.body.querySelector(".daily-bar-tooltip--floating");
}

afterEach(() => {
  document.body.replaceChildren();
  window.dispatchEvent(new Event("scroll"));
  vi.restoreAllMocks();
});

describe("renderDailyChartCompact", () => {
  it("shows one floating tooltip and hides it on mouse leave", () => {
    setViewport(800, 600);
    mockTooltipRect(180, 64);
    const { bars } = renderDailyChart([
      dailyEntry("2026-05-01", 1_200_000, 3.5),
      dailyEntry("2026-05-02", 4, 0.01),
    ]);
    const firstBar = bars[0];
    const secondBar = bars[1];

    mockElementRect(firstBar, 100, 100, 24, 200);
    firstBar.dispatchEvent(new MouseEvent("mouseenter"));

    let tooltip = getFloatingTooltip();
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain("1.2M tokens");
    expect(tooltip?.style.top).toBe("28px");
    expect(document.body.querySelectorAll(".daily-bar-tooltip--floating")).toHaveLength(1);

    firstBar.dispatchEvent(new MouseEvent("mouseleave"));
    expect(getFloatingTooltip()).toBeNull();

    mockElementRect(secondBar, 200, 320, 24, 6);
    secondBar.dispatchEvent(new MouseEvent("mouseenter"));

    tooltip = getFloatingTooltip();
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain("4 tokens");
    secondBar.dispatchEvent(new MouseEvent("mouseleave"));
  });

  it("flips below near the top and clamps inside a narrow viewport", () => {
    setViewport(120, 140);
    mockTooltipRect(100, 40);
    const { bars } = renderDailyChart([dailyEntry("2026-05-03", 10_000, 1)]);
    const firstBar = bars[0];

    mockElementRect(firstBar, 110, 12, 20, 20);
    firstBar.dispatchEvent(new MouseEvent("mouseenter"));

    const tooltip = getFloatingTooltip();
    expect(tooltip?.dataset.placement).toBe("below");
    expect(tooltip?.style.top).toBe("40px");
    expect(tooltip?.style.left).toBe("12px");
    firstBar.dispatchEvent(new MouseEvent("mouseleave"));
  });

  it("clears the floating tooltip when the chart DOM is removed", async () => {
    setViewport(800, 600);
    mockTooltipRect(160, 56);
    const { bars, container } = renderDailyChart([dailyEntry("2026-05-04", 500, 0.2)]);
    const firstBar = bars[0];
    mockElementRect(firstBar, 300, 220, 24, 80);

    firstBar.dispatchEvent(new MouseEvent("mouseenter"));
    expect(getFloatingTooltip()).not.toBeNull();

    container.remove();
    await Promise.resolve();
    expect(getFloatingTooltip()).toBeNull();
  });

  it("supports keyboard focus and day selection", () => {
    setViewport(800, 600);
    mockTooltipRect(160, 56);
    const { bars, onSelectDay } = renderDailyChart([dailyEntry("2026-05-04", 500, 0.2)]);
    const firstBar = bars[0];
    mockElementRect(firstBar, 300, 220, 24, 80);

    firstBar.dispatchEvent(new Event("focus"));
    expect(getFloatingTooltip()?.textContent).toContain("500 tokens");

    firstBar.dispatchEvent(new Event("blur"));
    expect(getFloatingTooltip()).toBeNull();

    firstBar.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-05-04", true);

    firstBar.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-05-04", false);

    const space = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: " ",
      shiftKey: true,
    });
    firstBar.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    expect(onSelectDay).toHaveBeenCalledWith("2026-05-04", true);

    firstBar.dispatchEvent(new MouseEvent("mouseenter"));
    firstBar.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    firstBar.dispatchEvent(new Event("focus"));
    firstBar.dispatchEvent(new MouseEvent("mouseleave"));
    expect(getFloatingTooltip()).toBeNull();
  });
});
