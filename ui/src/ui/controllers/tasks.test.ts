import { describe, expect, it, vi } from "vitest";

const { patchSessionMock } = vi.hoisted(() => ({
  patchSessionMock: vi.fn<
    (state: unknown, key: string, patch: { mode?: "normal" | "task" | null; taskId?: string | null }) => Promise<void>
  >(),
}));

vi.mock("./sessions.ts", async () => {
  const actual = await vi.importActual<typeof import("./sessions.ts")>("./sessions.ts");
  return {
    ...actual,
    patchSession: patchSessionMock,
  };
});

import { setCurrentTaskForSession, type TasksState } from "./tasks.ts";

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("setCurrentTaskForSession", () => {
  it("optimistically switches the session binding before the patch request resolves", async () => {
    const deferred = createDeferred();
    patchSessionMock.mockImplementationOnce(async () => {
      await deferred.promise;
    });

    const state = {
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
    } satisfies TasksState;

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
