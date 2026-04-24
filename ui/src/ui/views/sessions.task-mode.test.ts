/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderSessions, type SessionsProps } from "./sessions.ts";

function buildProps(overrides: Partial<SessionsProps> = {}): SessionsProps {
  return {
    loading: false,
    result: {
      ts: 1,
      path: "/tmp/sessions.json",
      count: 1,
      defaults: { modelProvider: null, model: null, contextTokens: null },
      sessions: [
        {
          key: "main",
          kind: "direct",
          updatedAt: Date.now(),
          mode: "task",
          taskId: "task-1",
        },
      ],
    },
    error: null,
    activeMinutes: "",
    limit: "120",
    includeGlobal: true,
    includeUnknown: true,
    basePath: "",
    searchQuery: "",
    sortColumn: "updated",
    sortDir: "desc",
    page: 0,
    pageSize: 10,
    selectedKeys: new Set(),
    expandedCheckpointKey: null,
    checkpointItemsByKey: {},
    checkpointLoadingKey: null,
    checkpointBusyKey: null,
    checkpointErrorByKey: {},
    onFiltersChange: () => undefined,
    onSearchChange: () => undefined,
    onSortChange: () => undefined,
    onPageChange: () => undefined,
    onPageSizeChange: () => undefined,
    onRefresh: () => undefined,
    onPatch: () => undefined,
    onToggleSelect: () => undefined,
    onSelectPage: () => undefined,
    onDeselectPage: () => undefined,
    onDeselectAll: () => undefined,
    onDeleteSelected: () => undefined,
    onToggleCheckpointDetails: () => undefined,
    onBranchFromCheckpoint: () => undefined,
    onRestoreCheckpoint: () => undefined,
    ...overrides,
  };
}

describe("renderSessions task mode columns", () => {
  it("renders mode and current task columns", async () => {
    const container = document.createElement("div");
    render(renderSessions(buildProps()), container);
    await Promise.resolve();
    const text = container.textContent ?? "";
    expect(text).toContain("Mode");
    expect(text).toContain("Current task");
    expect(text).toContain("task-1");
  });

  it("shows empty task-mode hint", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps({
          result: {
            ts: 1,
            path: "/tmp/sessions.json",
            count: 1,
            defaults: { modelProvider: null, model: null, contextTokens: null },
            sessions: [{ key: "main", kind: "direct", updatedAt: Date.now(), mode: "task" }],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();
    expect(container.textContent ?? "").toContain("needs task selection");
  });

  it("patches mode changes", async () => {
    const container = document.createElement("div");
    const onPatch = vi.fn();
    render(renderSessions(buildProps({ onPatch })), container);
    await Promise.resolve();
    const selects = Array.from(container.querySelectorAll("select"));
    const modeSelect = selects.find((select) =>
      Array.from((select).options).some((option) => option.value === "normal"),
    ) as HTMLSelectElement;
    modeSelect.value = "normal";
    modeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onPatch).toHaveBeenCalledWith("main", { mode: "normal", taskId: null });
  });
});
