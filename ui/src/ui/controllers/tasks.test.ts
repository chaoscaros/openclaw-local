import { describe, expect, it, vi } from "vitest";

const { patchSessionMock, loadSessionsMock } = vi.hoisted(() => ({
  patchSessionMock: vi.fn<
    (state: unknown, key: string, patch: { mode?: "normal" | "task" | null; taskId?: string | null }) => Promise<void>
  >(),
  loadSessionsMock: vi.fn<
    (
      state: unknown,
      overrides?: { activeMinutes?: number; limit?: number; includeGlobal?: boolean; includeUnknown?: boolean },
    ) => Promise<void>
  >(),
}));

vi.mock("./sessions.ts", async () => {
  const actual = await vi.importActual<typeof import("./sessions.ts")>("./sessions.ts");
  return {
    ...actual,
    patchSession: patchSessionMock,
    loadSessions: loadSessionsMock,
  };
});

import {
  createTaskTodo,
  loadTaskModeData,
  resolveSessionTask,
  setCurrentTaskForSession,
  setTaskTodoStatus,
  syncTaskModeTaskProgress,
  type TasksState,
} from "./tasks.ts";

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function buildTasksState(overrides: Partial<TasksState> = {}) {
  return {
    client: null,
    connected: false,
    sessionsLoading: false,
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
          taskId: "task-old",
        },
      ],
    },
    sessionsError: null,
    sessionsFilterActive: "",
    sessionsFilterLimit: "120",
    sessionsIncludeGlobal: true,
    sessionsIncludeUnknown: false,
    sessionsExpandedCheckpointKey: null,
    sessionsCheckpointItemsByKey: {},
    sessionsCheckpointLoadingKey: null,
    sessionsCheckpointBusyKey: null,
    sessionsCheckpointErrorByKey: {},
    sessionKey: "main",
    tasksLoading: false,
    tasksError: null,
    tasksItems: [],
    archivedTaskItems: [],
    tasksSelectedId: null,
    tasksBusy: false,
    ...overrides,
  } satisfies TasksState;
}

describe("setCurrentTaskForSession", () => {
  it("optimistically switches the session binding before the patch request resolves", async () => {
    const deferred = createDeferred();
    patchSessionMock.mockImplementationOnce(async () => {
      await deferred.promise;
    });

    const state = buildTasksState();

    const pending = setCurrentTaskForSession(state, "task-new");

    expect(state.tasksBusy).toBe(true);
    expect(state.sessionsResult?.sessions[0]?.taskId).toBe("task-new");
    expect(state.sessionsResult?.sessions[0]?.mode).toBe("task");

    deferred.resolve();
    await pending;

    expect(state.tasksBusy).toBe(false);
    expect(patchSessionMock).toHaveBeenCalledWith(state, "main", { mode: "task", taskId: "task-new" });
  });
});

describe("resolveSessionTask", () => {
  it("prefers a session-linked titled task when the bound task has an empty title", () => {
    const result = resolveSessionTask(
      "agent:solo:main",
      "task-empty",
      [
        {
          taskId: "task-empty",
          title: "",
          description: "好了，现在又改成",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 1,
          updatedAt: 2,
          lastSessionKey: "agent:solo:main",
        },
        {
          taskId: "task-real",
          title: "supply_vue项目新增获取商品规格库区列表和获取商品规格库存明细列表接口",
          description: "真实任务标题",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 1,
          updatedAt: 3,
          lastSessionKey: "agent:solo:main",
        },
      ],
      [],
      { mode: "task" },
    );

    expect(result.boundTask?.taskId).toBe("task-empty");
    expect(result.displayTask?.taskId).toBe("task-real");
    expect(result.derivedFromSessionLink).toBe(true);
  });
});

describe("loadTaskModeData", () => {
  it("self-heals by reloading the full session list when the current session row is missing", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "taskmode.list") {
        return { ok: true, tasks: [], archivedTasks: [] };
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    const state = buildTasksState({
      client: { request } as unknown as TasksState["client"],
      connected: true,
      sessionKey: "webchat:abc123",
      sessionsResult: {
        ts: 1,
        path: "",
        count: 1,
        defaults: { modelProvider: null, model: null, contextTokens: null },
        sessions: [{ key: "other", kind: "direct", updatedAt: Date.now() }],
      },
    });

    await loadTaskModeData(state, { autoSyncCurrentTask: false });

    expect(loadSessionsMock).toHaveBeenCalledWith(state, {
      activeMinutes: 0,
      limit: 0,
      includeGlobal: true,
      includeUnknown: true,
    });
    expect(request).toHaveBeenCalledWith("taskmode.list", {});
  });
});

describe("task todos", () => {
  it("creates a todo and updates derived next step", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "taskmode.todo.create") {
        return {
          ok: true,
          task: {
            id: "task-1",
            title: "Task 1",
            status: "active",
            effectiveStatus: "active",
            archived: false,
            createdAt: 1,
            updatedAt: 2,
            todoItems: [
              {
                id: "todo-1",
                taskId: "task-1",
                content: "补一条 next step",
                status: "pending",
                priority: "normal",
                source: "user",
                createdAt: 1,
                updatedAt: 2,
                order: 0,
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    const state = buildTasksState({
      client: { request } as unknown as TasksState["client"],
      connected: true,
      tasksItems: [
        {
          taskId: "task-1",
          title: "Task 1",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await createTaskTodo(state, "task-1", { content: "补一条 next step" });

    expect(request).toHaveBeenCalledWith("taskmode.todo.create", {
      taskId: "task-1",
      content: "补一条 next step",
    });
    expect(state.tasksItems[0]?.todoItems?.[0]?.content).toBe("补一条 next step");
    expect(state.tasksItems[0]?.nextStep).toBe("补一条 next step");
  });

  it("keeps only one in_progress todo and derives next step from it", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "taskmode.todo.setStatus") {
        return {
          ok: true,
          task: {
            id: "task-1",
            title: "Task 1",
            status: "active",
            effectiveStatus: "active",
            archived: false,
            createdAt: 1,
            updatedAt: 2,
            todoItems: [
              {
                id: "todo-1",
                taskId: "task-1",
                content: "旧的进行中",
                status: "pending",
                priority: "normal",
                source: "user",
                createdAt: 1,
                updatedAt: 2,
                order: 0,
              },
              {
                id: "todo-2",
                taskId: "task-1",
                content: "新的进行中",
                status: "in_progress",
                priority: "high",
                source: "agent",
                createdAt: 1,
                updatedAt: 3,
                order: 1,
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    const state = buildTasksState({
      client: { request } as unknown as TasksState["client"],
      connected: true,
      tasksItems: [
        {
          taskId: "task-1",
          title: "Task 1",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 1,
          updatedAt: 1,
          todoItems: [
            {
              id: "todo-1",
              taskId: "task-1",
              content: "旧的进行中",
              status: "in_progress",
              priority: "normal",
              source: "user",
              createdAt: 1,
              updatedAt: 1,
              order: 0,
            },
            {
              id: "todo-2",
              taskId: "task-1",
              content: "新的进行中",
              status: "pending",
              priority: "high",
              source: "agent",
              createdAt: 1,
              updatedAt: 1,
              order: 1,
            },
          ],
        },
      ],
    });

    await setTaskTodoStatus(state, "task-1", "todo-2", "in_progress");

    expect(state.tasksItems[0]?.todoItems?.filter((item) => item.status === "in_progress")).toHaveLength(1);
    expect(state.tasksItems[0]?.nextStep).toBe("新的进行中");
  });
});

describe("syncTaskModeTaskProgress", () => {
  it("updates the in-memory task detail from synced task progress", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "taskmode.sync") {
        return {
          ok: true,
          task: {
            id: "task-1",
            title: "Task 1",
            description: "original desc",
            progressSummary: "已完成任务同步链路",
            completedSummary: "补充了回归测试",
            nextStep: "继续验证 UI 行为",
            resourceContext: ["ui/src/ui/app-gateway.ts"],
            timeline: [{ at: 1, label: "最近进展", detail: "补充回归测试" }],
            status: "active",
            effectiveStatus: "active",
            runtimeHealth: "healthy",
            linkedRuntimeTaskIds: ["runtime-task-1"],
            latestRuntimeTaskId: "runtime-task-1",
            latestRunId: "run-1",
            runtimeTaskSummaries: [
              {
                taskId: "runtime-task-1",
                runtime: "subagent",
                status: "running",
                runId: "run-1",
                lastEventAt: 2,
                progressSummary: "已进入运行态",
                terminalSummary: "最终成功",
              },
            ],
            archived: false,
            createdAt: 1,
            updatedAt: 2,
          },
        };
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    const state = buildTasksState({
      client: { request } as unknown as TasksState["client"],
      connected: true,
      tasksItems: [
        {
          taskId: "task-1",
          title: "Task 1",
          description: "original desc",
          status: "active",
          effectiveStatus: "active",
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await syncTaskModeTaskProgress(state, "task-1");

    expect(request).toHaveBeenCalledWith("taskmode.sync", { id: "task-1", sessionKey: "main" });
    expect(state.tasksItems[0]?.progressSummary).toBe("已完成任务同步链路");
    expect(state.tasksItems[0]?.runtimeHealth).toBe("healthy");
    expect(state.tasksItems[0]?.latestRunId).toBe("run-1");
    expect(state.tasksItems[0]?.linkedRuntimeTaskIds).toContain("runtime-task-1");
    expect(state.tasksItems[0]?.runtimeTaskSummaries?.[0]).toMatchObject({
      taskId: "runtime-task-1",
      runtime: "subagent",
      status: "running",
      progressSummary: "已进入运行态",
      terminalSummary: "最终成功",
    });
    expect(state.tasksItems[0]?.resourceContext).toContain("ui/src/ui/app-gateway.ts");
    expect(state.tasksBusy).toBe(false);
  });
});
