/* @vitest-environment jsdom */

import { render } from "lit";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { renderTasks, type TasksViewProps } from "./tasks.ts";

function buildProps(overrides: Partial<TasksViewProps> = {}): TasksViewProps {
  return {
    loading: false,
    items: [
      {
        taskId: "task-1",
        title: "Task 1",
        description: "Ship the refreshed task center and improve task lookup. /Admin/inventory/storehouse-areas 传参 storehouse_id goods_spu_id",
        status: "active",
        effectiveStatus: "active",
        archived: false,
        createdAt: 1,
        updatedAt: Date.now(),
        flowId: "flow-1",
        flowStatus: "running",
        flowCurrentStep: "Finish task context bar",
        lastSessionKey: "agent:solo:main",
      },
      {
        taskId: "task-2",
        title: "Reference task",
        description: "Completed task that still matters for future reference.",
        status: "completed",
        effectiveStatus: "completed",
        archived: false,
        createdAt: 1,
        updatedAt: Date.now() - 2000,
      },
    ],
    error: null,
    currentSession: { key: "main", kind: "direct", updatedAt: Date.now(), mode: "task", taskId: "task-1" },
    createOpen: false,
    createTitle: "",
    createDescription: "",
    onRefresh: () => undefined,
    onRequestUpdate: () => undefined,
    onToggleCreate: () => undefined,
    onCreateTitleChange: () => undefined,
    onCreateDescriptionChange: () => undefined,
    onCreateTask: () => undefined,
    onToggleEdit: () => undefined,
    onEditTitleChange: () => undefined,
    onEditDescriptionChange: () => undefined,
    onSaveEdit: () => undefined,
    onSelectCurrent: () => undefined,
    onChangeStatus: () => undefined,
    onArchive: () => undefined,
    onRestore: () => undefined,
    onDelete: () => undefined,
    onEditTask: () => undefined,
    ...overrides,
  };
}

beforeAll(async () => {
  await i18n.setLocale("en");
});

describe("renderTasks", () => {
  it("renders tasks as a task center with grouped sections and preview", async () => {
    const container = document.createElement("div");
    render(renderTasks(buildProps()), container);
    await Promise.resolve();
    const text = container.textContent ?? "";
    expect(text).toContain("当前会话任务");
    expect(text).toContain("进行中");
    expect(text).toContain("已完成 · 保留参考");
    expect(text).toContain("任务预览");
    expect(text).toContain("当前进展");
    expect(text).toContain("下一步");
    expect(text).toContain("本轮完成");
    expect(text).toContain("资源上下文");
    expect(text).toContain("时间线");
    expect(text).toContain("查看技术细节");
    expect(text).toContain("Reference task");
  });

  it("renders archives as an independent archive manager", async () => {
    const container = document.createElement("div");
    render(
      renderTasks(
        buildProps({
          archiveMode: true,
          items: [
            {
              taskId: "task-2",
              title: "Archived task",
              description: "final archived state",
              status: "completed",
              effectiveStatus: "completed",
              archived: true,
              createdAt: 1,
              updatedAt: 2,
              archivedAt: Date.now(),
              lastSessionKey: "agent:solo:main",
            },
          ],
        }),
      ),
      container,
    );
    await Promise.resolve();
    const text = container.textContent ?? "";
    expect(text).toContain("归档");
    expect(text).toContain("搜索归档");
    expect(text).toContain("归档任务");
    expect(text).toContain("归档预览");
    expect(text).toContain("Restore");
    expect(text).toContain("Delete");
  });

  it("shows create drawer when task creation is open", async () => {
    const container = document.createElement("div");
    render(renderTasks(buildProps({ createOpen: true, createTitle: "New task" })), container);
    await Promise.resolve();
    const text = container.textContent ?? "";
    expect(text).toContain("新增任务");
    expect(text).toContain("Create");
    expect(container.querySelector('textarea')).toBeTruthy();
  });

  it("shows edit drawer when a task is being edited", async () => {
    const container = document.createElement("div");
    render(renderTasks(buildProps({ editId: "task-1", editTitle: "Edited task" })), container);
    await Promise.resolve();
    const text = container.textContent ?? "";
    expect(text).toContain("更新任务信息");
    expect(text).toContain("Save");
  });

  it("routes actions including delete", async () => {
    const container = document.createElement("div");
    const onSelectCurrent = vi.fn();
    const onChangeStatus = vi.fn();
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    const onToggleEdit = vi.fn();
    render(
      renderTasks(
        buildProps({ onSelectCurrent, onChangeStatus, onArchive, onDelete, onToggleEdit }),
      ),
      container,
    );
    await Promise.resolve();
    const select = container.querySelector("select") as HTMLSelectElement;
    select.value = "completed";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const buttons = Array.from(container.querySelectorAll("button"));
    buttons.find((button) => button.textContent?.includes("Set current"))?.click();
    buttons.find((button) => button.textContent?.includes("Edit"))?.click();
    buttons.find((button) => button.textContent?.includes("Archive"))?.click();
    buttons.find((button) => button.textContent?.includes("Delete"))?.click();
    expect(onChangeStatus).toHaveBeenCalledWith("task-1", "completed");
    expect(onSelectCurrent).toHaveBeenCalledWith("task-2");
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
});
