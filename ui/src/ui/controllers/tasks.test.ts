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

import { loadTaskModeData, setCurrentTaskForSession, syncTaskModeTaskProgress, type TasksState } from "./tasks.ts";

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
