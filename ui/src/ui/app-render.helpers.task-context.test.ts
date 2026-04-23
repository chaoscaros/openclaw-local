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
    setCurrentTaskForSession: vi.fn(async () => undefined),
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
  });

  it("separates current task from recent tasks in the switcher and triggers switching", async () => {
    const container = document.createElement("div");
    const state = buildState();
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
    expect(openedText).toContain("最近任务");
    expect(openedText).toContain("当前任务 A");
    expect(openedText).toContain("最近任务 B");

    const recentTaskButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("最近任务 B"),
    );
    recentTaskButton?.click();
    await Promise.resolve();

    expect(state.setCurrentTaskForSession).toHaveBeenCalledWith("task-recent");
  });
});
