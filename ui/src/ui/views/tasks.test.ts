/* @vitest-environment jsdom */

import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { renderTasks, type TasksViewProps } from "./tasks.ts";

function buildProps(overrides: Partial<TasksViewProps> = {}): TasksViewProps {
  return {
    loading: false,
    result: {
      ok: true,
      items: [
        {
          taskId: "task-1",
          title: "Task 1",
          status: "active",
          summary: "summary",
          currentPhase: "wiring",
          blocker: "schema missing",
          nextAction: "run build",
          createdAt: 1,
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    },
    error: null,
    filterStatus: "",
    searchQuery: "",
    selectedTaskId: null,
    detailLoading: false,
    detail: null,
    detailError: null,
    onFilterStatusChange: () => undefined,
    onSearchChange: () => undefined,
    onRefresh: () => undefined,
    onSelectTask: () => undefined,
    onCopyResumePrompt: () => undefined,
    onMarkDone: () => undefined,
    ...overrides,
  };
}

afterEach(async () => {
  await i18n.setLocale("en");
});

describe("renderTasks", () => {
  it("renders task list summary and detail placeholder", async () => {
    const container = document.createElement("div");
    render(renderTasks(buildProps()), container);
    await Promise.resolve();

    const text = container.textContent ?? "";
    expect(text).toContain("Task 1");
    expect(text).toContain("schema missing");
    expect(text).toContain("Select a task on the left to inspect details.");
  });

  it("renders zh-CN task copy from i18n keys", async () => {
    await i18n.setLocale("zh-CN");
    const container = document.createElement("div");
    render(renderTasks(buildProps()), container);
    await Promise.resolve();

    const text = container.textContent ?? "";
    const search = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(search.placeholder).toBe("搜索任务");
    expect(text).toContain("复制恢复指令");
    expect(text).toContain("请选择左侧任务查看详情。");
    expect(text).toContain("当前阶段：wiring");
    expect(text).toContain("阻塞：schema missing");
    expect(text).toContain("下一步：run build");

    await i18n.setLocale("en");
  });

  it("routes filter, search, select, copy, and done actions", async () => {
    const container = document.createElement("div");
    const onFilterStatusChange = vi.fn();
    const onSearchChange = vi.fn();
    const onSelectTask = vi.fn();
    const onCopyResumePrompt = vi.fn();
    const onMarkDone = vi.fn();

    render(
      renderTasks(
        buildProps({
          onFilterStatusChange,
          onSearchChange,
          onSelectTask,
          onCopyResumePrompt,
          onMarkDone,
        }),
      ),
      container,
    );
    await Promise.resolve();

    const select = container.querySelector("select") as HTMLSelectElement;
    select.value = "blocked";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const search = container.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = "task board";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    const buttons = Array.from(container.querySelectorAll("button"));
    buttons[1]?.click();
    buttons[2]?.click();
    buttons[3]?.click();

    expect(onFilterStatusChange).toHaveBeenCalledWith("blocked");
    expect(onSearchChange).toHaveBeenCalledWith("task board");
    expect(onSelectTask).toHaveBeenCalledWith("task-1");
    expect(onCopyResumePrompt).toHaveBeenCalledTimes(1);
    expect(onMarkDone).toHaveBeenCalledWith("task-1");
  });

  it("renders detail and checkpoints when available", async () => {
    const container = document.createElement("div");
    render(
      renderTasks(
        buildProps({
          selectedTaskId: "task-1",
          detail: {
            ok: true,
            task: {
              taskId: "task-1",
              title: "Task 1",
              status: "active",
              summary: "summary",
              createdAt: 1,
              updatedAt: 2,
              progress: { done: ["wired ui"], pending: ["align runtime"] },
              relatedFiles: ["ui/src/ui/views/tasks.ts"],
            },
            checkpoints: [
              {
                at: 1_700_000_000_000,
                step: "wire tasks",
                status: "done",
                next: "run build",
              },
            ],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    const text = container.textContent ?? "";
    expect(text).toContain("wired ui");
    expect(text).toContain("align runtime");
    expect(text).toContain("ui/src/ui/views/tasks.ts");
    expect(text).toContain("wire tasks");
    expect(text).toContain("run build");
    expect(text).toContain("Status: Active");
    expect(text).toContain("Next action: run build");
  });
});
