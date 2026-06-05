/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it } from "vitest";
import { renderLogs, type LogsProps } from "./logs.ts";

function createProps(overrides: Partial<LogsProps> = {}): LogsProps {
  return {
    loading: false,
    error: null,
    file: "/tmp/openclaw.log",
    entries: [],
    filterText: "",
    levelFilters: {
      trace: true,
      debug: true,
      info: true,
      warn: true,
      error: true,
      fatal: true,
    },
    autoFollow: true,
    truncated: false,
    onFilterTextChange: () => undefined,
    onLevelToggle: () => undefined,
    onToggleAutoFollow: () => undefined,
    onScroll: () => undefined,
    onRefresh: () => undefined,
    onExport: () => undefined,
    ...overrides,
  };
}

describe("renderLogs", () => {
  it("marks the logs card as fill-height so the stream owns desktop scrolling", async () => {
    const container = document.createElement("div");

    render(renderLogs(createProps()), container);
    await Promise.resolve();

    expect(container.querySelector("section.card")?.classList.contains("card--fill-height")).toBe(
      true,
    );
  });
});
