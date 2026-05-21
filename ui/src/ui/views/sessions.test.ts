/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { SessionsListResult } from "../types.ts";
import { renderSessions, type SessionsProps } from "./sessions.ts";

function buildResult(session: SessionsListResult["sessions"][number]): SessionsListResult {
  return {
    ts: Date.now(),
    path: "(multiple)",
    count: 1,
    defaults: { modelProvider: null, model: null, contextTokens: null },
    sessions: [session],
  };
}

function buildMultiResult(sessions: SessionsListResult["sessions"]): SessionsListResult {
  return {
    ts: Date.now(),
    path: "(multiple)",
    count: sessions.length,
    defaults: { modelProvider: null, model: null, contextTokens: null },
    sessions,
  };
}

function buildProps(result: SessionsListResult): SessionsProps {
  return {
    loading: false,
    result,
    error: null,
    activeMinutes: "",
    limit: "120",
    includeGlobal: false,
    includeUnknown: false,
    basePath: "",
    searchQuery: "",
    sortColumn: "updated",
    sortDir: "desc",
    page: 0,
    pageSize: 10,
    selectedKeys: new Set<string>(),
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
  };
}

describe("sessions view", () => {
  it("renders verbose=full without falling back to inherit", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps(
          buildResult({
            key: "agent:main:main",
            kind: "direct",
            updatedAt: Date.now(),
            verboseLevel: "full",
          }),
        ),
      ),
      container,
    );
    await Promise.resolve();

    const selects = Array.from(container.querySelectorAll("select"));
    const verbose = selects.find((select) =>
      Array.from(select.options).some((option) => option.value === "full"),
    );
    expect(verbose?.value).toBe("full");
    expect(Array.from(verbose?.options ?? []).some((option) => option.value === "full")).toBe(true);
  });

  it("keeps unknown stored values selectable instead of forcing inherit", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps(
          buildResult({
            key: "agent:main:main",
            kind: "direct",
            updatedAt: Date.now(),
            reasoningLevel: "custom-mode",
          }),
        ),
      ),
      container,
    );
    await Promise.resolve();

    const selects = Array.from(container.querySelectorAll("select"));
    const reasoning = selects.find((select) =>
      Array.from(select.options).some((option) => option.value === "custom-mode"),
    );
    expect(reasoning?.value).toBe("custom-mode");
    expect(
      Array.from(reasoning?.options ?? []).some((option) => option.value === "custom-mode"),
    ).toBe(true);
  });

  it("renders explicit fast mode without falling back to inherit", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps(
          buildResult({
            key: "agent:main:main",
            kind: "direct",
            updatedAt: Date.now(),
            fastMode: true,
          }),
        ),
      ),
      container,
    );
    await Promise.resolve();

    const selects = Array.from(container.querySelectorAll("select"));
    const fast = selects.find((select) => {
      const values = new Set(Array.from(select.options).map((option) => option.value));
      return values.has("on") && values.has("off") && !values.has("full");
    });
    expect(fast?.value).toBe("on");
  });

  it("deselects only the current page from the header checkbox", async () => {
    const onSelectPage = vi.fn();
    const onDeselectPage = vi.fn();
    const onDeselectAll = vi.fn();
    const container = document.createElement("div");
    render(
      renderSessions({
        ...buildProps(
          buildMultiResult([
            {
              key: "page-0",
              kind: "direct",
              updatedAt: 20,
            },
            {
              key: "page-1",
              kind: "direct",
              updatedAt: 10,
            },
          ]),
        ),
        pageSize: 1,
        selectedKeys: new Set(["page-0", "off-page"]),
        onSelectPage,
        onDeselectPage,
        onDeselectAll,
      }),
      container,
    );
    await Promise.resolve();

    const headerCheckbox = container.querySelector("thead input[type=checkbox]");
    headerCheckbox?.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onDeselectPage).toHaveBeenCalledWith(["page-0"]);
    expect(onDeselectAll).not.toHaveBeenCalled();
    expect(onSelectPage).not.toHaveBeenCalled();
  });

  it("hides internal dreaming narrative sessions from the sessions table", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps(
          buildMultiResult([
            {
              key: "agent:solo:dreaming-narrative-light-abc",
              kind: "direct",
              updatedAt: 20,
            },
            {
              key: "agent:solo:main",
              kind: "direct",
              updatedAt: 10,
            },
          ]),
        ),
      ),
      container,
    );
    await Promise.resolve();

    const text = container.textContent ?? "";
    expect(text).toContain("agent:solo:main");
    expect(text).not.toContain("agent:solo:dreaming-narrative-light-abc");
  });

  it("renders the sessions table with stable key and compaction layout hooks", async () => {
    const container = document.createElement("div");
    render(
      renderSessions(
        buildProps(
          buildResult({
            key: "agent:solo:very-long-session-key-that-should-not-wrap",
            kind: "direct",
            displayName: "Very long display name for the active session",
            updatedAt: Date.now(),
            compactionCheckpointCount: 0,
          }),
        ),
      ),
      container,
    );
    await Promise.resolve();

    const table = container.querySelector("table");
    expect(table?.classList.contains("sessions-table")).toBe(true);
    const row = container.querySelector("tbody tr.session-data-row");
    expect(row).not.toBeNull();
    const keyCell = container.querySelector<HTMLElement>(".session-key-cell");
    expect(keyCell?.title).toBe("agent:solo:very-long-session-key-that-should-not-wrap");
    expect(container.querySelector(".session-compaction-count")?.textContent?.trim()).toBe(
      "No checkpoints yet",
    );
  });

  it("expands checkpoint details across all local sessions columns", async () => {
    const container = document.createElement("div");
    render(
      renderSessions({
        ...buildProps(
          buildResult({
            key: "agent:solo:main",
            kind: "direct",
            updatedAt: Date.now(),
            compactionCheckpointCount: 1,
          }),
        ),
        expandedCheckpointKey: "agent:solo:main",
        checkpointItemsByKey: {
          "agent:solo:main": [
            {
              checkpointId: "cp-1",
              sessionKey: "agent:solo:main",
              sessionId: "session-1",
              createdAt: Date.now(),
              reason: "manual",
              summary: "Kept useful context.",
              preCompaction: { sessionId: "session-1" },
              postCompaction: { sessionId: "session-1" },
            },
          ],
        },
      }),
      container,
    );
    await Promise.resolve();

    const detailsRow = container.querySelector<HTMLTableRowElement>(
      ".session-checkpoint-details-row",
    );
    expect(detailsRow).not.toBeNull();
    expect(detailsRow?.querySelector("td")?.getAttribute("colspan")).toBe("13");
    expect(detailsRow?.querySelector(".session-checkpoint-card")).not.toBeNull();
  });
});
