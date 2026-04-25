/* @vitest-environment jsdom */

import { render } from "lit";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n/index.ts";
import { renderChatTaskHeaderBar } from "./app-render.helpers.ts";

beforeAll(async () => {
  await i18n.setLocale("en");
});

function buildState(overrides: Record<string, unknown> = {}) {
  const state = {
    sessionKey: "main",
    tasksItems: [
      {
        taskId: "task-current",
        title: "当前任务 A",
        description: "修复聊天任务切换显示",
        nextStep: "补充聊天任务抽屉里的执行清单摘要",
        todoItems: [
          {
            id: "todo-1",
            taskId: "task-current",
            content: "定位聊天任务切换显示问题",
            status: "in_progress",
            priority: "high",
            source: "user",
            createdAt: 1,
            updatedAt: Date.now(),
            order: 0,
          },
          {
            id: "todo-2",
            taskId: "task-current",
            content: "补充聊天任务抽屉里的执行清单摘要",
            status: "pending",
            priority: "normal",
            source: "agent",
            createdAt: 2,
            updatedAt: Date.now(),
            order: 1,
          },
          {
            id: "todo-3",
            taskId: "task-current",
            content: "完成最近完成项展示",
            status: "completed",
            priority: "normal",
            source: "agent",
            createdAt: 3,
            updatedAt: Date.now(),
            order: 2,
          },
        ],
        status: "active",
        effectiveStatus: "active",
        archived: false,
        createdAt: 1,
        updatedAt: Date.now(),
      },
      {
        taskId: "task-recent",
        title: "最近任务 B",
        description: "补充最近任务切换入口",
        status: "paused",
        effectiveStatus: "paused",
        archived: false,
        createdAt: 1,
        updatedAt: Date.now() - 1000,
      },
      {
        taskId: "task-done",
        title: "已完成任务 C",
        description: "这个任务已经结束，不应该出现在切换列表",
        status: "completed",
        effectiveStatus: "completed",
        archived: false,
        createdAt: 1,
        updatedAt: Date.now() - 500,
      },
    ],
    archivedTaskItems: [],
    sessionsResult: {
      ts: 1,
      path: "",
      count: 1,
      defaults: { modelProvider: null, model: null, contextTokens: null },
      sessions: [
        {
          key: "main",
          kind: "direct",
          updatedAt: Date.now(),
          mode: "task",
          taskId: "task-current",
        },
      ],
    },
    setCurrentSessionMode: vi.fn(),
    setCurrentTaskForSession: vi.fn(async (_taskId: string) => undefined),
    setTab: vi.fn(),
    requestUpdate: undefined as undefined | (() => void),
    ...overrides,
  };
  return state;
}

describe("renderChatTaskHeaderBar", () => {
  it("shows the bound current task clearly in the chat header", async () => {
    const container = document.createElement("div");
    const state = buildState();
    state.requestUpdate = () => {
      render(renderChatTaskHeaderBar(state as never), container);
    };

    render(renderChatTaskHeaderBar(state as never), container);
    await Promise.resolve();

    const text = container.textContent ?? "";
    expect(text).toContain("当前任务");
    expect(text).toContain("当前任务 A");
    expect(text).toContain("当前会话任务");
    expect(text).not.toContain("修复聊天任务切换显示");
  });

  it("shows other active tasks in the switcher while excluding completed ones", async () => {
    const container = document.createElement("div");
    const state = buildState({
      tasksItems: [
        {
          taskId: "task-current",
          title: "当前任务 A",
          description: "修复聊天任务切换显示",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 1,
          updatedAt: Date.now(),
        },
        {
          taskId: "task-recent",
          title: "最近任务 B",
          description: "补充最近任务切换入口",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 2,
          updatedAt: Date.now() - 1000,
        },
        {
          taskId: "task-done",
          title: "已完成任务 C",
          description: "这个任务已经结束，不应该出现在切换列表",
          status: "completed",
          effectiveStatus: "completed",
          archived: false,
          createdAt: 3,
          updatedAt: Date.now() - 500,
        },
      ],
    });
    state.requestUpdate = () => {
      render(renderChatTaskHeaderBar(state as never), container);
    };

    render(renderChatTaskHeaderBar(state as never), container);
    await Promise.resolve();

    const buttons = Array.from(container.querySelectorAll("button"));
    buttons.find((button) => button.textContent?.includes("切换任务"))?.click();
    await Promise.resolve();

    const openedText = container.textContent ?? "";
    expect(openedText).toContain("当前任务");
    expect(openedText).toContain("可切换任务");
    expect(openedText).toContain("当前任务 A");
    expect(openedText).toContain("最近任务 B");
    expect(openedText).not.toContain("已完成任务 C");
    expect(openedText).not.toContain("没有可切换的任务");
  });

  it("does not return completed tasks in switcher search results", async () => {
    const container = document.createElement("div");
    const state = buildState();
    state.requestUpdate = () => {
      render(renderChatTaskHeaderBar(state as never), container);
    };

    render(renderChatTaskHeaderBar(state as never), container);
    await Promise.resolve();

    Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("切换任务"))
      ?.click();
    await Promise.resolve();

    const search = container.querySelector<HTMLInputElement>('input[placeholder="按任务名称或描述搜索"]');
    search!.value = "已完成任务";
    search!.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();

    expect(container.textContent ?? "").not.toContain("已完成任务 C");
    expect(container.textContent ?? "").toContain("没有匹配的可切换任务");
  });

  it("shows task todo summary inside the detail drawer", async () => {
    const container = document.createElement("div");
    const state = buildState();
    state.requestUpdate = () => {
      render(renderChatTaskHeaderBar(state as never), container);
    };

    render(renderChatTaskHeaderBar(state as never), container);
    await Promise.resolve();

    Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("任务详情"))
      ?.click();
    await Promise.resolve();

    const text = container.textContent ?? "";
    expect(text).toContain("当前进行中");
    expect(text).toContain("定位聊天任务切换显示问题");
    expect(text).toContain("下一步");
    expect(text).toContain("补充聊天任务抽屉里的执行清单摘要");
    expect(text).toContain("最近完成");
    expect(text).toContain("完成最近完成项展示");
  });

  it("falls back to the linked titled task when the bound task has no title", async () => {
    const container = document.createElement("div");
    const state = buildState({
      tasksItems: [
        {
          taskId: "task-empty",
          title: "",
          description: "好了，现在又改成：storage_storehouse_area_id",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 1,
          updatedAt: Date.now() - 1000,
          lastSessionKey: "main",
        },
        {
          taskId: "task-real",
          title: "supply_vue项目新增获取商品规格库区列表和获取商品规格库存明细列表接口",
          description: "真实标题应该显示这里",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 2,
          updatedAt: Date.now(),
          lastSessionKey: "main",
        },
      ],
      sessionsResult: {
        ts: 1,
        path: "",
        count: 1,
        defaults: { modelProvider: null, model: null, contextTokens: null },
        sessions: [
          {
            key: "main",
            kind: "direct",
            updatedAt: Date.now(),
            mode: "task",
            taskId: "task-empty",
          },
        ],
      },
    });
    state.requestUpdate = () => {
      render(renderChatTaskHeaderBar(state as never), container);
    };

    render(renderChatTaskHeaderBar(state as never), container);
    await Promise.resolve();

    const headerText = container.textContent ?? "";
    expect(headerText).toContain("supply_vue项目新增获取商品规格库区列表和获取商品规格库存明细列表接口");
    expect(headerText).not.toContain("当前未绑定任务");
  });

  it("shows a bound-but-unresolved current task instead of claiming it is unbound", async () => {
    const container = document.createElement("div");
    const state = buildState({
      tasksItems: [
        {
          taskId: "task-recent",
          title: "最近任务 B",
          description: "补充最近任务切换入口",
          status: "paused",
          effectiveStatus: "paused",
          archived: false,
          createdAt: 1,
          updatedAt: Date.now() - 1000,
        },
      ],
      sessionsResult: {
        ts: 1,
        path: "",
        count: 1,
        defaults: { modelProvider: null, model: null, contextTokens: null },
        sessions: [
          {
            key: "main",
            kind: "direct",
            updatedAt: Date.now(),
            mode: "task",
            taskId: "task-missing",
          },
        ],
      },
    });
    state.requestUpdate = () => {
      render(renderChatTaskHeaderBar(state as never), container);
    };

    render(renderChatTaskHeaderBar(state as never), container);
    await Promise.resolve();

    const headerText = container.textContent ?? "";
    expect(headerText).toContain("当前未绑定任务");
    expect(headerText).toContain("已绑定");
    expect(headerText).toContain("已绑定任务 · task-missing");
    expect(headerText).not.toContain("当前会话还没有绑定任务");

    Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("切换任务"))
      ?.click();
    await Promise.resolve();

    const openedText = container.textContent ?? "";
    expect(openedText).toContain("当前任务详情同步中");
    expect(openedText).toContain("已绑定任务 · task-missing · 请稍候或刷新任务列表");
    expect(openedText).toContain("可切换任务");
  });
});
