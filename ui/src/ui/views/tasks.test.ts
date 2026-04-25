/* @vitest-environment jsdom */

import { render } from "lit";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { renderTasks, resetTaskViewStateForTests, type TasksViewProps } from "./tasks.ts";

function buildProps(overrides: Partial<TasksViewProps> = {}): TasksViewProps {
  return {
    loading: false,
    items: [
      {
        taskId: "task-1",
        title: "Task 1",
        description: "Ship the refreshed task center and improve task lookup. /Admin/inventory/storehouse-areas /Admin/inventory/storehouse-detail /Admin/inventory/storehouse-bind 传参 storehouse_id goods_spu_id area_id page per_page",
        progressSummary: "已完成任务进度自动同步链路，补齐 session history 聚合，并把任务详情默认展示改成摘要优先。",
        completedSummary: "补齐了历史同步、按钮入口和 runtime 详情预览。",
        nextStep: "继续验证真实 UI 场景，并确认抽屉里的完整记录与当前任务保持一致。",
        todoItems: [
          {
            id: "todo-1",
            taskId: "task-1",
            content: "定位聊天任务切换器当前任务显示问题",
            status: "in_progress",
            priority: "high",
            source: "user",
            createdAt: Date.now() - 3000,
            updatedAt: Date.now() - 2000,
            order: 0,
          },
          {
            id: "todo-2",
            taskId: "task-1",
            content: "补齐任务详情里的执行清单交互",
            status: "pending",
            priority: "normal",
            source: "agent",
            createdAt: Date.now() - 2000,
            updatedAt: Date.now() - 1000,
            order: 1,
          },
          {
            id: "todo-3",
            taskId: "task-1",
            content: "补充聊天任务抽屉的最近完成展示",
            status: "completed",
            priority: "normal",
            source: "agent",
            createdAt: Date.now() - 1500,
            updatedAt: Date.now() - 500,
            order: 2,
          },
        ],
        resourceContext: [
          "ui/src/ui/app-gateway.ts",
          "ui/src/ui/views/tasks.ts",
          "ui/src/ui/controllers/tasks.ts",
          "src/gateway/task-mode-store.ts",
        ],
        timeline: [
          { at: Date.now(), label: "最近进展", detail: "补齐历史同步链路" },
          { at: Date.now() - 1000, label: "联调", detail: "完成 UI 与 gateway 联调" },
          { at: Date.now() - 2000, label: "验证", detail: "补上回归测试" },
          { at: Date.now() - 3000, label: "发布前检查", detail: "确认运行态摘要与详情一致" },
        ],
        status: "active",
        effectiveStatus: "active",
        archived: false,
        createdAt: 1,
        updatedAt: Date.now(),
        flowId: "flow-1",
        flowStatus: "running",
        flowCurrentStep: "Finish task context bar",
        runtimeHealth: "healthy",
        latestRuntimeTaskId: "runtime-task-1",
        latestRunId: "run-1",
        linkedRuntimeTaskIds: ["runtime-task-1"],
        runtimeTaskSummaries: [
          {
            taskId: "runtime-task-1",
            runtime: "subagent",
            status: "running",
            runId: "run-1",
            lastEventAt: Date.now(),
            progressSummary: "正在整理任务中心上下文，并补齐完整记录抽屉里的摘要与详情切换，避免详情页直接堆满全部信息。同时还在核对时间线预览、任务切换后的抽屉内容以及完整记录浏览体验是否一致。",
          },
          {
            taskId: "runtime-task-2",
            runtime: "cli",
            status: "failed",
            runId: "run-2",
            lastEventAt: Date.now() - 1000,
            error: "sandbox denied",
            terminalSummary: "命令执行被沙箱拒绝，CLI 退出前已经输出了完整错误上下文和恢复建议，需要在抽屉里查看完整记录，并进一步确认沙箱权限、重试路径和恢复步骤说明是否完整。",
          },
        ],
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
    onSyncProgress: () => undefined,
    onCreateTodo: async () => null,
    onUpdateTodo: async () => null,
    onSetTodoStatus: async () => null,
    onDeleteTodo: async () => null,
    onEditTask: () => undefined,
    ...overrides,
  };
}

beforeAll(async () => {
  await i18n.setLocale("en");
});

beforeEach(() => {
  resetTaskViewStateForTests();
});

describe("renderTasks", () => {
  it("renders tasks as a task center with grouped sections and preview", async () => {
    const container = document.createElement("div");
    const onRequestUpdate = vi.fn(() => {
      render(renderTasks(buildProps({ onRequestUpdate })), container);
    });
    render(renderTasks(buildProps({ onRequestUpdate })), container);
    await Promise.resolve();
    const text = container.textContent ?? "";
    expect(text).toContain("当前会话任务");
    expect(text).toContain("进行中");
    expect(text).toContain("已完成 · 保留参考");
    expect(text).toContain("任务预览");
    expect(text).toContain("当前进展");
    expect(text).toContain("已完成任务进度自动同步链路");
    expect(text).toContain("下一步");
    expect(text).toContain("继续验证真实 UI 场景");
    expect(text).toContain("本轮完成");
    expect(text).toContain("补齐了历史同步、按钮入口和 runtime 详情预览。");
    expect(text).toContain("资源上下文");
    expect(text).toContain("ui/src/ui/app-gateway.ts");
    expect(text).toContain("ui/src/ui/views/tasks.ts");
    expect(text).toContain("ui/src/ui/controllers/tasks.ts");
    expect(text).toContain("还有 4 项资源上下文");
    expect(text).toContain("还有 1 个接口");
    expect(text).toContain("还有 3 个参数");
    expect(text).not.toContain("src/gateway/task-mode-store.ts");
    expect(text).toContain("时间线");
    expect(text).toContain("查看完整时间线");
    expect(text).toContain("最近进展");
    expect(text).toContain("联调");
    expect(text).toContain("验证");
    expect(text).toContain("还有 3 条时间线记录");
    expect(text).not.toContain("发布前检查");
    expect(text).toContain("技术细节");
    expect(text).toContain("查看完整技术细节");
    expect(text).toContain("查看完整资源上下文");
    expect(text).toContain("/Admin/inventory/storehouse-areas");
    expect(text).toContain("/Admin/inventory/storehouse-detail");
    expect(text).not.toContain("/Admin/inventory/storehouse-bind");
    expect(text).toContain("storehouse_id");
    expect(text).toContain("goods_spu_id");
    expect(text).not.toContain("per_page");
    expect(text).toContain("同步历史进度");
    expect(text).toContain("执行清单");
    expect(text).toContain("定位聊天任务切换器当前任务显示问题");
    expect(text).toContain("补齐任务详情里的执行清单交互");
    expect(text).toContain("补充聊天任务抽屉的最近完成展示");
    expect(text).toContain("添加清单项");
    expect(text).toContain("执行层健康");
    expect(text).toContain("执行正常");
    expect(text).toContain("最近 Run");
    expect(text).toContain("run-1");
    expect(text).toContain("关联 runtime tasks");
    expect(text).toContain("runtime-task-1 · latest");
    expect(text).toContain("subagent");
    expect(text).toContain("Running");
    expect(text).toContain("cli");
    expect(text).toContain("Failed");
    expect(text).toContain("sandbox denied");
    expect(text).toContain("最新");
    expect(text).toContain("异常");
    expect(text).toContain("查看详情");
    expect(text).toContain("重试");
    expect(text).toContain("取消");
    expect(text).toContain("Runtime task 详情");
    expect(text).toContain("taskId：runtime-task-1");
    expect(text).toContain("runtimeHealth：执行正常");
    expect(text).toContain("是否 latest：是");
    expect(text).toContain("是否异常：否");
    expect(text).toContain("查看完整进展摘要");
    expect(text).not.toContain("查看完整状态轨迹");
    expect(text).toContain("progressSummary：正在整理任务中心上下文，并补齐完整记录抽屉里的摘要与详情切换".slice(0, 40));
    const runtimeRows = Array.from(container.querySelectorAll('.task-preview-pane__detail-list .task-runtime-row')) as HTMLElement[];
    const latestRowIndex = runtimeRows.findIndex((node) => (node.textContent ?? '').includes('runtime-task-1'));
    const exceptionRowIndex = runtimeRows.findIndex((node) => (node.textContent ?? '').includes('runtime-task-2'));
    expect(latestRowIndex).toBeGreaterThanOrEqual(0);
    expect(exceptionRowIndex).toBeGreaterThan(latestRowIndex);
    expect(runtimeRows[latestRowIndex]?.className).toContain('task-runtime-row--latest');
    expect(runtimeRows[exceptionRowIndex]?.className).toContain('task-runtime-row--exception');
    const runtimeActionButtons = Array.from(container.querySelectorAll('.task-runtime-row__actions button')) as HTMLButtonElement[];
    expect(runtimeActionButtons.length).toBeGreaterThanOrEqual(3);
    const detailButtons = runtimeActionButtons.filter((button) => button.textContent?.includes('查看详情'));
    const nonDetailButtons = runtimeActionButtons.filter((button) => !button.textContent?.includes('查看详情'));
    expect(detailButtons.length).toBeGreaterThanOrEqual(1);
    expect(detailButtons.every((button) => ! button.disabled)).toBe(true);
    expect(nonDetailButtons.every((button) => button.disabled)).toBe(true);
    detailButtons[detailButtons.length - 1]?.click();
    await Promise.resolve();
    const updatedText = container.textContent ?? "";
    expect(updatedText).toContain("taskId：runtime-task-2");
    expect(updatedText).toContain("runtimeHealth：执行正常");
    expect(updatedText).toContain("是否 latest：否");
    expect(updatedText).toContain("是否异常：是");
    expect(updatedText).toContain("terminalSummary：命令执行被沙箱拒绝");
    expect(updatedText).toContain("还有 1 条轨迹");
    expect(updatedText).toContain("查看完整状态轨迹");
    const runtimeDetailPanel = Array.from(container.querySelectorAll('.task-preview-pane__detail-list'))
      .find((node) => (node.textContent ?? '').includes('Runtime task 详情')) as HTMLElement | undefined;
    const terminalRecordButton = Array.from(runtimeDetailPanel?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent?.includes('查看完整终端摘要') && button.parentElement?.textContent?.includes('terminalSummary'),
    );
    expect(terminalRecordButton).toBeTruthy();
    terminalRecordButton?.click();
    await Promise.resolve();
    const drawerText = container.textContent ?? "";
    expect(drawerText).toContain("Runtime 完整记录");
    expect(drawerText).toContain("terminalSummary");
    expect(drawerText).toContain("taskId：task-1");
    expect(drawerText).toContain("runtimeTaskId：runtime-task-2");
    expect(drawerText).toContain("字段：terminalSummary");
    expect(drawerText).toContain("字符数：");
    expect(drawerText).toContain("恢复步骤说明是否完整");
    const resourceBlock = Array.from(container.querySelectorAll('.task-preview-pane__block'))
      .find((node) => (node.textContent ?? '').includes('资源上下文')) as HTMLElement | undefined;
    const resourceButton = Array.from(resourceBlock?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent?.includes('查看完整资源上下文'),
    );
    expect(resourceButton).toBeTruthy();
    resourceButton?.click();
    await Promise.resolve();
    const resourceDrawerText = container.textContent ?? "";
    expect(resourceDrawerText).toContain("完整资源上下文");
    expect(resourceDrawerText).toContain("taskId：task-1");
    expect(resourceDrawerText).toContain("路径数：7");
    expect(resourceDrawerText).toContain("接口数：3");
    expect(resourceDrawerText).toContain("参数数：5");
    expect(resourceDrawerText).toContain("src/gateway/task-mode-store.ts");
    const technicalDetailsBlock = Array.from(container.querySelectorAll('.task-technical-details'))
      .find((node) => (node.textContent ?? '').includes('技术细节')) as HTMLElement | undefined;
    const detailsButton = Array.from(technicalDetailsBlock?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent?.includes('查看完整技术细节') || button.textContent?.includes('查看技术细节'),
    );
    expect(detailsButton).toBeTruthy();
    detailsButton?.click();
    await Promise.resolve();
    const technicalDrawerText = container.textContent ?? "";
    expect(technicalDrawerText).toContain("完整技术细节");
    expect(technicalDrawerText).toContain("taskId：task-1");
    expect(technicalDrawerText).toContain("接口数：3");
    expect(technicalDrawerText).toContain("参数数：5");
    expect(technicalDrawerText).toContain("/Admin/inventory/storehouse-bind");
    expect(technicalDrawerText).toContain("per_page");
    const timelineButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('查看完整时间线'));
    timelineButton?.click();
    await Promise.resolve();
    const timelineDrawerText = container.textContent ?? "";
    expect(timelineDrawerText).toContain("任务时间线");
    expect(timelineDrawerText).toContain("taskId：task-1");
    expect(timelineDrawerText).toContain("记录条数：");
    expect(timelineDrawerText).toContain("最近会话：agent:solo:main");
    expect(timelineDrawerText).toContain("发布前检查");
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

  it("supports sorting execution checklist items by priority and recent update", async () => {
    const container = document.createElement("div");
    const baseNow = Date.now();
    const props = buildProps({
      currentSession: { key: "main", kind: "direct", updatedAt: baseNow, mode: "task", taskId: "task-sort" },
      items: [
        {
          taskId: "task-sort",
          title: "Task sort",
          description: "Verify todo sorting",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 1,
          updatedAt: baseNow,
          todoItems: [
            {
              id: "todo-low-new",
              taskId: "task-sort",
              content: "低优先级但最近更新",
              status: "pending",
              priority: "low",
              source: "agent",
              createdAt: 1,
              updatedAt: baseNow,
              order: 0,
            },
            {
              id: "todo-high-old",
              taskId: "task-sort",
              content: "高优先级但较早更新",
              status: "pending",
              priority: "high",
              source: "user",
              createdAt: 2,
              updatedAt: baseNow - 10_000,
              order: 1,
            },
            {
              id: "todo-normal-mid",
              taskId: "task-sort",
              content: "普通优先级",
              status: "pending",
              priority: "normal",
              source: "system",
              createdAt: 3,
              updatedAt: baseNow - 5_000,
              order: 2,
            },
          ],
        },
      ],
      onRequestUpdate: () => {
        render(renderTasks(props), container);
      },
    });
    render(renderTasks(props), container);
    await Promise.resolve();

    const sortSelect = container.querySelector('.task-todo-toolbar select') as HTMLSelectElement | null;
    expect(sortSelect).toBeTruthy();
    expect(container.textContent ?? '').toContain('清单排序');

    const pendingOrder = () =>
      Array.from(container.querySelectorAll('.task-preview-pane__detail-list--todos'))
        .find((section) => (section.textContent ?? '').includes('待做'))
        ?.querySelectorAll('.task-todo-row__content');

    const pendingTexts = () => Array.from(pendingOrder() ?? []).map((node) => node.textContent?.trim() ?? '');

    expect(pendingTexts()).toEqual(['低优先级但最近更新', '高优先级但较早更新', '普通优先级']);

    sortSelect!.value = 'priority';
    sortSelect!.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(pendingTexts()).toEqual(['高优先级但较早更新', '普通优先级', '低优先级但最近更新']);

    sortSelect!.value = 'updated_desc';
    sortSelect!.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(pendingTexts()).toEqual(['低优先级但最近更新', '普通优先级', '高优先级但较早更新']);
  });

  it("shows the linked titled task in the current-task section when the bound task title is empty", async () => {
    const container = document.createElement("div");
    const baseNow = Date.now();
    render(
      renderTasks(
        buildProps({
          currentSession: { key: "main", kind: "direct", updatedAt: baseNow, mode: "task", taskId: "task-empty" },
          items: [
            {
              taskId: "task-empty",
              title: "",
              description: "好了，现在又改成：storage_storehouse_area_id",
              status: "active",
              effectiveStatus: "active",
              archived: false,
              createdAt: 1,
              updatedAt: baseNow - 1000,
              lastSessionKey: "main",
            },
            {
              taskId: "task-real",
              title: "supply_vue项目新增获取商品规格库区列表和获取商品规格库存明细列表接口",
              description: "真实任务标题",
              status: "active",
              effectiveStatus: "active",
              archived: false,
              createdAt: 2,
              updatedAt: baseNow,
              lastSessionKey: "main",
            },
          ],
        }),
      ),
      container,
    );
    await Promise.resolve();
    const text = container.textContent ?? "";
    expect(text).toContain("当前会话任务");
    expect(text).toContain("supply_vue项目新增获取商品规格库区列表和获取商品规格库存明细列表接口");
  });

  it("supports sorting the main task list by recency and title", async () => {
    const container = document.createElement("div");
    const baseNow = Date.now();
    const props = buildProps({
      currentSession: { key: "main", kind: "direct", updatedAt: baseNow, mode: "task" },
      items: [
        {
          taskId: "task-zeta",
          title: "Zeta task",
          description: "newest update",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 10,
          updatedAt: baseNow,
        },
        {
          taskId: "task-alpha",
          title: "Alpha task",
          description: "middle update",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 20,
          updatedAt: baseNow - 10_000,
        },
        {
          taskId: "task-middle",
          title: "Middle task",
          description: "older update",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 30,
          updatedAt: baseNow - 30_000,
        },
      ],
      onRequestUpdate: () => {
        render(renderTasks(props), container);
      },
    });
    render(renderTasks(props), container);
    await Promise.resolve();

    const mainSort = Array.from(container.querySelectorAll('.task-toolbar select'))
      .find((node) => (node.parentElement?.textContent ?? '').includes('主列表排序')) as HTMLSelectElement | null;
    expect(mainSort).toBeTruthy();
    expect(container.textContent ?? '').toContain('主列表排序');

    const activeTitles = () =>
      Array.from(container.querySelectorAll('.task-section-card'))
        .find((section) => (section.textContent ?? '').includes('仍需继续推进的任务。'))
        ?.querySelectorAll('.task-list-item__title');

    const activeTexts = () => Array.from(activeTitles() ?? []).map((node) => node.textContent?.trim() ?? '');

    expect(activeTexts()).toEqual(['Zeta task', 'Alpha task', 'Middle task']);

    mainSort!.value = 'title_asc';
    mainSort!.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(activeTexts()).toEqual(['Alpha task', 'Middle task', 'Zeta task']);

    mainSort!.value = 'created_desc';
    mainSort!.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(activeTexts()).toEqual(['Middle task', 'Alpha task', 'Zeta task']);
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
    const onSyncProgress = vi.fn();
    render(
      renderTasks(
        buildProps({ onSelectCurrent, onChangeStatus, onArchive, onDelete, onToggleEdit, onSyncProgress }),
      ),
      container,
    );
    await Promise.resolve();
    const select = Array.from(container.querySelectorAll("select")).find(
      (node) => (node.parentElement?.textContent ?? "").includes("Status"),
    );
    expect(select).toBeTruthy();
    select!.value = "completed";
    select!.dispatchEvent(new Event("change", { bubbles: true }));
    const buttons = Array.from(container.querySelectorAll("button"));
    buttons.find((button) => button.textContent?.includes("Set current"))?.click();
    buttons.find((button) => button.textContent?.includes("同步历史进度"))?.click();
    buttons.find((button) => button.textContent?.includes("Edit"))?.click();
    buttons.find((button) => button.textContent?.includes("Archive"))?.click();
    buttons.find((button) => button.textContent?.includes("Delete"))?.click();
    expect(onChangeStatus).toHaveBeenCalledWith("task-1", "completed");
    expect(onSelectCurrent).toHaveBeenCalledWith("task-2");
    expect(onSyncProgress).toHaveBeenCalledWith("task-1");
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
});
