import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionAndRefresh,
  deleteSessionsAndRefresh,
  loadSessions,
  subscribeSessions,
  type SessionsState,
} from "./sessions.ts";

type RequestFn = (method: string, params?: unknown) => Promise<unknown>;

if (!("window" in globalThis)) {
  Object.assign(globalThis, {
    window: {
      confirm: () => false,
    },
  });
}

function createState(request: RequestFn, overrides: Partial<SessionsState> = {}): SessionsState {
  return {
    client: { request } as unknown as SessionsState["client"],
    connected: true,
    sessionsLoading: false,
    sessionsResult: null,
    sessionsError: null,
    sessionsFilterActive: "0",
    sessionsFilterLimit: "0",
    sessionsIncludeGlobal: true,
    sessionsIncludeUnknown: true,
    sessionsExpandedCheckpointKey: null,
    sessionsCheckpointItemsByKey: {},
    sessionsCheckpointLoadingKey: null,
    sessionsCheckpointBusyKey: null,
    sessionsCheckpointErrorByKey: {},
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscribeSessions", () => {
  it("registers for session change events", async () => {
    const request = vi.fn(async () => ({ subscribed: true }));
    const state = createState(request);

    await subscribeSessions(state);

    expect(request).toHaveBeenCalledWith("sessions.subscribe", {});
    expect(state.sessionsError).toBeNull();
  });
});

describe("createSessionAndRefresh", () => {
  it("creates a dashboard session and refreshes the session list", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.create") {
        return { key: "agent:main:dashboard:created" };
      }
      if (method === "sessions.list") {
        return {
          ts: 1,
          path: "",
          count: 1,
          defaults: {},
          sessions: [{ key: "agent:main:dashboard:created", kind: "direct", updatedAt: 1 }],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);

    const key = await createSessionAndRefresh(
      state,
      { agentId: "main", parentSessionKey: "main", emitCommandHooks: true },
      { activeMinutes: 120, limit: 100, includeGlobal: true, includeUnknown: true },
    );

    expect(key).toBe("agent:main:dashboard:created");
    expect(request).toHaveBeenNthCalledWith(1, "sessions.create", {
      agentId: "main",
      parentSessionKey: "main",
      emitCommandHooks: true,
    });
    expect(request).toHaveBeenNthCalledWith(2, "sessions.list", {
      includeGlobal: true,
      includeUnknown: true,
      activeMinutes: 120,
      limit: 100,
    });
    expect(state.sessionsLoading).toBe(false);
    expect(state.sessionsResult?.sessions[0]?.key).toBe("agent:main:dashboard:created");
  });
});

describe("deleteSessionsAndRefresh", () => {
  it("deletes multiple sessions and refreshes", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.delete") {
        return { ok: true };
      }
      if (method === "sessions.list") {
        return undefined;
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const deleted = await deleteSessionsAndRefresh(state, ["key-a", "key-b"]);

    expect(deleted).toEqual(["key-a", "key-b"]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenNthCalledWith(1, "sessions.delete", {
      key: "key-a",
      deleteTranscript: true,
    });
    expect(request).toHaveBeenNthCalledWith(2, "sessions.delete", {
      key: "key-b",
      deleteTranscript: true,
    });
    expect(request).toHaveBeenNthCalledWith(3, "sessions.list", {
      includeGlobal: true,
      includeUnknown: true,
    });
    expect(state.sessionsLoading).toBe(false);
  });

  it("returns empty array when user cancels", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const deleted = await deleteSessionsAndRefresh(state, ["key-a"]);

    expect(deleted).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("returns partial results when some deletes fail", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "sessions.delete") {
        const p = params as { key: string };
        if (p.key === "key-b" || p.key === "key-c") {
          throw new Error(`delete failed: ${p.key}`);
        }
        return { ok: true };
      }
      if (method === "sessions.list") {
        return undefined;
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const deleted = await deleteSessionsAndRefresh(state, ["key-a", "key-b", "key-c", "key-d"]);

    expect(deleted).toEqual(["key-a", "key-d"]);
    expect(state.sessionsError).toBe("Error: delete failed: key-b; Error: delete failed: key-c");
    expect(state.sessionsLoading).toBe(false);
  });

  it("returns empty array when already loading", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request, { sessionsLoading: true });

    const deleted = await deleteSessionsAndRefresh(state, ["key-a"]);

    expect(deleted).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("loadSessions", () => {
  it("clears a stale local chat run when the current session refreshes as terminal", async () => {
    const requestUpdate = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return {
          ts: 2,
          path: "(multiple)",
          count: 1,
          defaults: {},
          sessions: [
            {
              key: "agent:main:main",
              kind: "direct",
              updatedAt: 2,
              hasActiveRun: false,
              status: "done",
              endedAt: 2,
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request, {
      sessionsResult: {
        ts: 1,
        path: "(multiple)",
        count: 1,
        defaults: {},
        sessions: [
          {
            key: "agent:main:main",
            kind: "direct",
            updatedAt: 1,
            hasActiveRun: true,
            status: "running",
          },
        ],
      } as never,
    }) as SessionsState & {
      sessionKey: string;
      chatRunId: string | null;
      chatStream: string | null;
      chatStreamStartedAt: number | null;
      requestUpdate: () => void;
    };
    state.sessionKey = "agent:main:main";
    state.chatRunId = "run-1";
    state.chatStream = "";
    state.chatStreamStartedAt = 1;
    state.requestUpdate = requestUpdate;

    await loadSessions(state);

    expect(state.chatRunId).toBeNull();
    expect(state.chatStream).toBeNull();
    expect(state.chatStreamStartedAt).toBeNull();
    expect(requestUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps a local chat run when the refreshed current session is still active", async () => {
    const requestUpdate = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return {
          ts: 2,
          path: "(multiple)",
          count: 1,
          defaults: {},
          sessions: [
            {
              key: "agent:main:main",
              kind: "direct",
              updatedAt: 2,
              hasActiveRun: true,
              status: "running",
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request) as SessionsState & {
      sessionKey: string;
      chatRunId: string | null;
      chatStream: string | null;
      chatStreamStartedAt: number | null;
      requestUpdate: () => void;
    };
    state.sessionKey = "agent:main:main";
    state.chatRunId = "run-1";
    state.chatStream = "";
    state.chatStreamStartedAt = 1;
    state.requestUpdate = requestUpdate;

    await loadSessions(state);

    expect(state.chatRunId).toBe("run-1");
    expect(state.chatStream).toBe("");
    expect(state.chatStreamStartedAt).toBe(1);
    expect(requestUpdate).not.toHaveBeenCalled();
  });

  it("keeps a local chat run when the active session key matches through an alias", async () => {
    const requestUpdate = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return {
          ts: 2,
          path: "(multiple)",
          count: 1,
          defaults: {},
          sessions: [
            {
              key: "agent:solo:main",
              kind: "direct",
              updatedAt: 2,
              hasActiveRun: true,
              status: "running",
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request) as SessionsState & {
      sessionKey: string;
      chatRunId: string | null;
      chatStream: string | null;
      chatStreamStartedAt: number | null;
      requestUpdate: () => void;
    };
    state.sessionKey = "main";
    state.chatRunId = "run-1";
    state.chatStream = "";
    state.chatStreamStartedAt = 1;
    state.requestUpdate = requestUpdate;

    await loadSessions(state);

    expect(state.chatRunId).toBe("run-1");
    expect(state.chatStream).toBe("");
    expect(requestUpdate).not.toHaveBeenCalled();
  });

  it("keeps a local chat run while the send ack is still pending", async () => {
    const requestUpdate = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return {
          ts: 2,
          path: "(multiple)",
          count: 1,
          defaults: {},
          sessions: [
            {
              key: "agent:main:main",
              kind: "direct",
              updatedAt: 2,
              hasActiveRun: false,
              status: "done",
              endedAt: 2,
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request) as SessionsState & {
      sessionKey: string;
      chatSending: boolean;
      chatRunId: string | null;
      chatStream: string | null;
      chatStreamStartedAt: number | null;
      requestUpdate: () => void;
    };
    state.sessionKey = "agent:main:main";
    state.chatSending = true;
    state.chatRunId = "run-1";
    state.chatStream = "";
    state.chatStreamStartedAt = Date.now();
    state.requestUpdate = requestUpdate;

    await loadSessions(state);

    expect(state.chatRunId).toBe("run-1");
    expect(state.chatStream).toBe("");
    expect(state.chatStreamStartedAt).toEqual(expect.any(Number));
    expect(requestUpdate).not.toHaveBeenCalled();
  });

  it("keeps a just-staged local chat run through stale terminal session refreshes", async () => {
    const requestUpdate = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return {
          ts: 2,
          path: "(multiple)",
          count: 1,
          defaults: {},
          sessions: [
            {
              key: "agent:main:main",
              kind: "direct",
              updatedAt: 2,
              hasActiveRun: false,
              status: "done",
              endedAt: 2,
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request) as SessionsState & {
      sessionKey: string;
      chatSending: boolean;
      chatRunId: string | null;
      chatStream: string | null;
      chatStreamStartedAt: number | null;
      requestUpdate: () => void;
    };
    const startedAt = Date.now();
    state.sessionKey = "agent:main:main";
    state.chatSending = false;
    state.chatRunId = "run-1";
    state.chatStream = "";
    state.chatStreamStartedAt = startedAt;
    state.requestUpdate = requestUpdate;

    await loadSessions(state);

    expect(state.chatRunId).toBe("run-1");
    expect(state.chatStream).toBe("");
    expect(state.chatStreamStartedAt).toBe(startedAt);
    expect(requestUpdate).not.toHaveBeenCalled();
  });

  it("preserves a local terminal override when a stale refresh still reports running", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return {
          ts: 2,
          path: "(multiple)",
          count: 1,
          defaults: {},
          sessions: [
            {
              key: "agent:main:main",
              kind: "direct",
              updatedAt: 2,
              hasActiveRun: true,
              status: "running",
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request, {
      sessionRunTerminalOverrides: {
        "agent:main:main": { status: "done", endedAt: 123 },
      },
    });

    await loadSessions(state);

    expect(state.sessionsResult?.sessions[0]).toEqual(
      expect.objectContaining({
        hasActiveRun: false,
        status: "done",
        endedAt: 123,
      }),
    );
    expect(state.sessionRunTerminalOverrides?.["agent:main:main"]).toEqual({
      status: "done",
      endedAt: 123,
    });
  });

  it("clears a local terminal override once the server also reports terminal", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return {
          ts: 2,
          path: "(multiple)",
          count: 1,
          defaults: {},
          sessions: [
            {
              key: "agent:main:main",
              kind: "direct",
              updatedAt: 2,
              hasActiveRun: false,
              status: "done",
              endedAt: 200,
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request, {
      sessionRunTerminalOverrides: {
        "agent:main:main": { status: "done", endedAt: 123 },
      },
    });

    await loadSessions(state);

    expect(state.sessionsResult?.sessions[0]).toEqual(
      expect.objectContaining({
        status: "done",
        endedAt: 200,
      }),
    );
    expect(state.sessionRunTerminalOverrides).toBeUndefined();
  });

  it("refreshes expanded checkpoint cards when the row summary changes", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.list") {
        return {
          ts: 1,
          path: "(multiple)",
          count: 1,
          defaults: {},
          sessions: [
            {
              key: "agent:main:main",
              kind: "direct",
              updatedAt: 1,
              compactionCheckpointCount: 1,
              latestCompactionCheckpoint: {
                checkpointId: "checkpoint-new",
                createdAt: 20,
              },
            },
          ],
        };
      }
      if (method === "sessions.compaction.list") {
        return {
          ok: true,
          key: "agent:main:main",
          checkpoints: [
            {
              checkpointId: "checkpoint-new",
              sessionKey: "agent:main:main",
              sessionId: "session-1",
              createdAt: 20,
              reason: "manual",
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request, {
      sessionsExpandedCheckpointKey: "agent:main:main",
      sessionsResult: {
        ts: 0,
        path: "(multiple)",
        count: 1,
        defaults: {},
        sessions: [
          {
            key: "agent:main:main",
            kind: "direct",
            updatedAt: 0,
            compactionCheckpointCount: 3,
            latestCompactionCheckpoint: {
              checkpointId: "checkpoint-old",
              createdAt: 10,
            },
          },
        ],
      } as never,
      sessionsCheckpointItemsByKey: {
        "agent:main:main": [
          {
            checkpointId: "checkpoint-old",
            sessionKey: "agent:main:main",
            sessionId: "session-old",
            createdAt: 10,
            reason: "manual",
          },
        ] as never,
      },
    });

    await loadSessions(state);

    expect(request).toHaveBeenNthCalledWith(1, "sessions.list", {
      includeGlobal: true,
      includeUnknown: true,
    });
    expect(request).toHaveBeenNthCalledWith(2, "sessions.compaction.list", {
      key: "agent:main:main",
    });
    expect(
      state.sessionsCheckpointItemsByKey["agent:main:main"]?.map((item) => item.checkpointId),
    ).toEqual(["checkpoint-new"]);
  });
});
