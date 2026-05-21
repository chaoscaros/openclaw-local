import { beforeEach, describe, expect, it, vi } from "vitest";
import { GATEWAY_EVENT_UPDATE_AVAILABLE } from "../../../src/gateway/events.js";
import { ConnectErrorDetailCodes } from "../../../src/gateway/protocol/connect-error-details.js";
import {
  connectGateway,
  continueDevExecuteAfterSessionRefresh,
  continueTaskBindingAfterSessionRefresh,
  resolveControlUiClientVersion,
} from "./app-gateway.ts";
import type { GatewayHelloOk } from "./gateway.ts";
import type { SessionsListResult } from "./types.ts";

const { loadChatHistoryMock, loadTaskModeDataMock, loadSessionsMock, patchSessionMock } =
  vi.hoisted(() => ({
    loadChatHistoryMock: vi.fn(async () => undefined),
    loadTaskModeDataMock: vi.fn(async () => undefined),
    loadSessionsMock: vi.fn(async () => undefined),
    patchSessionMock: vi.fn(async () => undefined),
  }));

type GatewayClientMock = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  options: { clientVersion?: string };
  emitHello: (hello?: GatewayHelloOk) => void;
  emitClose: (info: {
    code: number;
    reason?: string;
    error?: { code: string; message: string; details?: unknown };
  }) => void;
  emitGap: (expected: number, received: number) => void;
  emitEvent: (evt: { event: string; payload?: unknown; seq?: number }) => void;
};

const gatewayClientInstances: GatewayClientMock[] = [];

vi.mock("./gateway.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gateway.ts")>();

  function resolveGatewayErrorDetailCode(
    error: { details?: unknown } | null | undefined,
  ): string | null {
    const details = error?.details;
    if (!details || typeof details !== "object") {
      return null;
    }
    const code = (details as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }

  class GatewayBrowserClient {
    readonly start = vi.fn();
    readonly stop = vi.fn();

    constructor(
      private opts: {
        clientVersion?: string;
        onHello?: (hello: GatewayHelloOk) => void;
        onClose?: (info: {
          code: number;
          reason: string;
          error?: { code: string; message: string; details?: unknown };
        }) => void;
        onGap?: (info: { expected: number; received: number }) => void;
        onEvent?: (evt: { event: string; payload?: unknown; seq?: number }) => void;
      },
    ) {
      gatewayClientInstances.push({
        start: this.start,
        stop: this.stop,
        options: { clientVersion: this.opts.clientVersion },
        emitHello: (hello) => {
          this.opts.onHello?.(
            hello ?? {
              type: "hello-ok",
              protocol: 3,
              snapshot: {},
            },
          );
        },
        emitClose: (info) => {
          this.opts.onClose?.({
            code: info.code,
            reason: info.reason ?? "",
            error: info.error,
          });
        },
        emitGap: (expected, received) => {
          this.opts.onGap?.({ expected, received });
        },
        emitEvent: (evt) => {
          this.opts.onEvent?.(evt);
        },
      });
    }
  }

  return { ...actual, GatewayBrowserClient, resolveGatewayErrorDetailCode };
});

vi.mock("./controllers/chat.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./controllers/chat.ts")>();
  return {
    ...actual,
    loadChatHistory: loadChatHistoryMock,
  };
});

vi.mock("./controllers/tasks.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./controllers/tasks.ts")>();
  return {
    ...actual,
    loadTaskModeData: loadTaskModeDataMock,
  };
});

vi.mock("./controllers/sessions.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./controllers/sessions.ts")>();
  return {
    ...actual,
    loadSessions: loadSessionsMock,
    patchSession: patchSessionMock,
  };
});

type TestGatewayHost = Parameters<typeof connectGateway>[0] & {
  chatSideResult: unknown;
  chatSideResultTerminalRuns: Set<string>;
  chatQueue: Array<{ id: string; text: string; createdAt: number; pendingRunId?: string }>;
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  chatToolMessages: Record<string, unknown>[];
  toolStreamById: Map<string, unknown>;
  toolStreamOrder: string[];
};

function createHost(): TestGatewayHost {
  return {
    settings: {
      gatewayUrl: "ws://127.0.0.1:18789",
      token: "",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navGroupsCollapsed: {},
      borderRadius: 50,
    },
    password: "",
    applySettings: vi.fn(function (this: { settings: TestGatewayHost["settings"] }, next) {
      this.settings = next;
    }),
    clientInstanceId: "instance-test",
    client: null,
    connected: false,
    hello: null,
    lastError: null,
    lastErrorCode: null,
    eventLogBuffer: [],
    eventLog: [],
    tab: "overview",
    presenceEntries: [],
    presenceError: null,
    presenceStatus: null,
    agentsLoading: false,
    agentsList: null,
    agentsError: null,
    debugHealth: null,
    assistantName: "OpenClaw",
    assistantAvatar: null,
    assistantAgentId: null,
    localMediaPreviewRoots: [],
    serverVersion: null,
    sessionsLoading: false,
    sessionsError: null,
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
    sessionKey: "main",
    chatMessages: [],
    chatQueue: [],
    chatToolMessages: [],
    chatStreamSegments: [],
    chatStream: null,
    chatStreamStartedAt: null,
    chatRunId: null,
    agentLifecycleChatRunId: null,
    chatSideResult: null,
    chatSending: false,
    toolStreamById: new Map(),
    toolStreamOrder: [],
    toolStreamSyncTimer: null,
    refreshSessionsAfterChat: new Set<string>(),
    taskCarryoverAfterChatByRun: new Map<string, { taskId: string; sourceSessionKey: string }>(),
    devExecuteCarryoverAfterChatByRun: new Map<
      string,
      { changeReviewModeEnabled: boolean; sourceSessionKey: string; allowSameSession?: boolean }
    >(),
    resumedDevExecuteBySessionKey: new Map<
      string,
      { changeReviewModeEnabled: boolean; remainingTurns: number }
    >(),
    chatSideResultTerminalRuns: new Set<string>(),
    execApprovalQueue: [],
    execApprovalError: null,
    updateAvailable: null,
  } as unknown as TestGatewayHost;
}

function connectHostGateway() {
  const host = createHost();
  connectGateway(host);
  const client = gatewayClientInstances[0];
  expect(client).toBeDefined();
  return { host, client };
}

function emitToolResultEvent(client: GatewayClientMock) {
  client.emitEvent({
    event: "agent",
    payload: {
      runId: "engine-run-1",
      seq: 1,
      stream: "tool",
      ts: 1,
      sessionKey: "main",
      data: {
        toolCallId: "tool-1",
        name: "fetch",
        phase: "result",
        result: { text: "ok" },
      },
    },
  });
}

describe("connectGateway", () => {
  beforeEach(() => {
    gatewayClientInstances.length = 0;
    loadChatHistoryMock.mockClear();
    loadTaskModeDataMock.mockClear();
    loadSessionsMock.mockClear();
    patchSessionMock.mockClear();
  });

  it("ignores stale client onGap callbacks after reconnect", () => {
    const host = createHost();

    connectGateway(host);
    const firstClient = gatewayClientInstances[0];
    expect(firstClient).toBeDefined();

    connectGateway(host);
    const secondClient = gatewayClientInstances[1];
    expect(secondClient).toBeDefined();

    firstClient.emitGap(10, 13);
    expect(host.lastError).toBeNull();

    secondClient.emitGap(20, 24);
    expect(gatewayClientInstances).toHaveLength(3);
    expect(secondClient.stop).toHaveBeenCalledTimes(1);
    expect(host.lastError).toBeNull();
  });

  it("rebinds the current task onto a new session after /new completes", async () => {
    const host = createHost();
    host.taskCarryoverAfterChatByRun.set("run-new", {
      taskId: "task-current",
      sourceSessionKey: "main",
    });
    host.sessionsResult = {
      ts: 2,
      path: "",
      count: 2,
      defaults: { modelProvider: null, model: null, contextTokens: null },
      sessions: [
        {
          key: "main",
          kind: "direct",
          updatedAt: Date.now(),
          mode: "task",
          taskId: "task-current",
        },
        { key: "agent:solo:main:new", kind: "direct", updatedAt: Date.now(), mode: "normal" },
      ],
    } as never;

    await continueTaskBindingAfterSessionRefresh(host, "run-new", "agent:solo:main:new");

    expect(patchSessionMock).toHaveBeenCalledWith(host, "agent:solo:main:new", {
      mode: "task",
      taskId: "task-current",
    });
    expect(loadTaskModeDataMock).toHaveBeenCalled();
    expect(host.taskCarryoverAfterChatByRun.has("run-new")).toBe(false);
  });

  it("ignores stale client onEvent callbacks after reconnect", () => {
    const host = createHost();

    connectGateway(host);
    const firstClient = gatewayClientInstances[0];
    expect(firstClient).toBeDefined();

    connectGateway(host);
    const secondClient = gatewayClientInstances[1];
    expect(secondClient).toBeDefined();

    firstClient.emitEvent({ event: "presence", payload: { presence: [{ host: "stale" }] } });
    expect(host.eventLogBuffer).toHaveLength(0);

    secondClient.emitEvent({ event: "presence", payload: { presence: [{ host: "active" }] } });
    expect(host.eventLogBuffer).toHaveLength(1);
    expect(host.eventLogBuffer[0]?.event).toBe("presence");
  });

  it("applies update.available only from active client", () => {
    const host = createHost();

    connectGateway(host);
    const firstClient = gatewayClientInstances[0];
    expect(firstClient).toBeDefined();

    connectGateway(host);
    const secondClient = gatewayClientInstances[1];
    expect(secondClient).toBeDefined();

    firstClient.emitEvent({
      event: GATEWAY_EVENT_UPDATE_AVAILABLE,
      payload: {
        updateAvailable: { currentVersion: "1.0.0", latestVersion: "9.9.9", channel: "latest" },
      },
    });
    expect(host.updateAvailable).toBeNull();

    secondClient.emitEvent({
      event: GATEWAY_EVENT_UPDATE_AVAILABLE,
      payload: {
        updateAvailable: { currentVersion: "1.0.0", latestVersion: "2.0.0", channel: "latest" },
      },
    });
    expect(host.updateAvailable).toEqual({
      currentVersion: "1.0.0",
      latestVersion: "2.0.0",
      channel: "latest",
    });
  });

  it("ignores stale client onClose callbacks after reconnect", () => {
    const host = createHost();

    connectGateway(host);
    const firstClient = gatewayClientInstances[0];
    expect(firstClient).toBeDefined();

    connectGateway(host);
    const secondClient = gatewayClientInstances[1];
    expect(secondClient).toBeDefined();

    firstClient.emitClose({ code: 1005 });
    expect(host.lastError).toBeNull();
    expect(host.lastErrorCode).toBeNull();

    secondClient.emitClose({ code: 1005 });
    expect(host.lastError).toBe("disconnected (1005): no reason");
    expect(host.lastErrorCode).toBeNull();
  });

  it("preserves pending approval requests across reconnect", () => {
    const host = createHost();
    host.execApprovalQueue = [
      {
        id: "approval-1",
        kind: "exec",
        title: "Approve command",
        summary: "rm -rf /tmp/nope",
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + 60_000,
      } as never,
    ];

    connectGateway(host);
    expect(host.execApprovalQueue).toHaveLength(1);

    connectGateway(host);
    expect(host.execApprovalQueue).toHaveLength(1);
    expect(host.execApprovalQueue[0]?.id).toBe("approval-1");
  });

  it("maps generic fetch-failed auth errors to actionable token mismatch message", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitClose({
      code: 4008,
      reason: "connect failed",
      error: {
        code: "INVALID_REQUEST",
        message: "Fetch failed",
        details: { code: ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH },
      },
    });

    expect(host.lastErrorCode).toBe(ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH);
    expect(host.lastError).toContain("gateway token mismatch");
  });

  it("maps TypeError fetch failures to actionable auth rate-limit guidance", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitClose({
      code: 4008,
      reason: "connect failed",
      error: {
        code: "INVALID_REQUEST",
        message: "TypeError: Failed to fetch",
        details: { code: ConnectErrorDetailCodes.AUTH_RATE_LIMITED },
      },
    });

    expect(host.lastErrorCode).toBe(ConnectErrorDetailCodes.AUTH_RATE_LIMITED);
    expect(host.lastError).toContain("too many failed authentication attempts");
  });

  it("maps generic fetch failures to actionable device identity guidance", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitClose({
      code: 4008,
      reason: "connect failed",
      error: {
        code: "INVALID_REQUEST",
        message: "Fetch failed",
        details: { code: ConnectErrorDetailCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED },
      },
    });

    expect(host.lastErrorCode).toBe(ConnectErrorDetailCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED);
    expect(host.lastError).toContain("device identity required");
  });

  it("maps generic fetch failures to actionable origin guidance", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitClose({
      code: 4008,
      reason: "connect failed",
      error: {
        code: "INVALID_REQUEST",
        message: "Fetch failed",
        details: { code: ConnectErrorDetailCodes.CONTROL_UI_ORIGIN_NOT_ALLOWED },
      },
    });

    expect(host.lastErrorCode).toBe(ConnectErrorDetailCodes.CONTROL_UI_ORIGIN_NOT_ALLOWED);
    expect(host.lastError).toContain("origin not allowed");
  });

  it("preserves specific close errors even when auth detail codes are present", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitClose({
      code: 4008,
      reason: "connect failed",
      error: {
        code: "INVALID_REQUEST",
        message: "Failed to fetch gateway metadata from ws://127.0.0.1:18789",
        details: { code: ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH },
      },
    });

    expect(host.lastErrorCode).toBe(ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH);
    expect(host.lastError).toBe("Failed to fetch gateway metadata from ws://127.0.0.1:18789");
  });

  it("prefers structured connect errors over close reason", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitClose({
      code: 4008,
      reason: "connect failed",
      error: {
        code: "INVALID_REQUEST",
        message:
          "unauthorized: gateway token mismatch (open the dashboard URL and paste the token in Control UI settings)",
        details: { code: "AUTH_TOKEN_MISMATCH" },
      },
    });

    expect(host.lastError).toContain("gateway token mismatch");
    expect(host.lastErrorCode).toBe("AUTH_TOKEN_MISMATCH");
  });

  it("surfaces shutdown restart reasons before the socket closes", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitEvent({
      event: "shutdown",
      payload: {
        reason: "config change requires gateway restart (plugins.installs)",
        restartExpectedMs: 1500,
      },
    });
    client.emitClose({ code: 1006 });

    expect(host.lastError).toBe(
      "Restarting: config change requires gateway restart (plugins.installs)",
    );
    expect(host.lastErrorCode).toBeNull();
  });

  it("clears pending shutdown messages on successful hello after reconnect", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitEvent({
      event: "shutdown",
      payload: {
        reason: "config change",
        restartExpectedMs: 1500,
      },
    });
    client.emitClose({ code: 1006 });

    expect(host.lastError).toBe("Restarting: config change");

    client.emitHello();
    expect(host.lastError).toBeNull();

    client.emitClose({ code: 1006 });
    expect(host.lastError).toBe("disconnected (1006): no reason");
  });

  it("keeps shutdown restart reasons on service restart closes", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitEvent({
      event: "shutdown",
      payload: {
        reason: "gateway restarting",
        restartExpectedMs: 1500,
      },
    });
    client.emitClose({ code: 1012, reason: "service restart" });

    expect(host.lastError).toBe("Restarting: gateway restarting");
    expect(host.lastErrorCode).toBeNull();
  });

  it("prefers shutdown restart reasons over non-1012 close reasons", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitEvent({
      event: "shutdown",
      payload: {
        reason: "gateway restarting",
        restartExpectedMs: 1500,
      },
    });
    client.emitClose({ code: 1001, reason: "going away" });

    expect(host.lastError).toBe("Restarting: gateway restarting");
    expect(host.lastErrorCode).toBeNull();
  });

  it("does not reload chat history for each live tool result event", () => {
    const { client } = connectHostGateway();
    emitToolResultEvent(client);

    expect(loadChatHistoryMock).not.toHaveBeenCalled();
    expect(loadTaskModeDataMock).not.toHaveBeenCalled();
  });

  it("reloads sessions before task-mode data when session bindings change", async () => {
    const { client, host } = connectHostGateway();
    host.tab = "chat";
    const order: string[] = [];
    loadSessionsMock.mockImplementationOnce(async () => {
      order.push("sessions");
    });
    loadTaskModeDataMock.mockImplementationOnce(async () => {
      order.push("tasks");
    });

    client.emitEvent({ event: "sessions.changed", payload: { sessionKey: "main" } });
    await Promise.resolve();
    await Promise.resolve();

    expect(order).toEqual(["sessions", "tasks"]);
    expect(loadSessionsMock).toHaveBeenCalledWith(host, {
      activeMinutes: 0,
      limit: 0,
      includeGlobal: true,
      includeUnknown: true,
    });
    expect(loadTaskModeDataMock).toHaveBeenCalledWith(host, { autoSyncCurrentTask: false });
  });

  it.each(["final", "aborted", "error"] as const)(
    "reloads task-mode data after chat %s events for the active session",
    (terminalState) => {
      const { client, host } = connectHostGateway();
      host.chatRunId = "run-task-1";

      client.emitEvent({
        event: "chat",
        payload: {
          runId: "run-task-1",
          sessionKey: "main",
          state: terminalState,
          ...(terminalState === "error" ? { errorMessage: "run failed" } : {}),
        },
      });

      expect(loadTaskModeDataMock).toHaveBeenCalledTimes(1);
      expect(loadTaskModeDataMock).toHaveBeenCalledWith(host);
    },
  );

  it("marks the current session row terminal when the active chat run finishes", () => {
    const { client, host } = connectHostGateway();
    const requestUpdate = vi.fn();
    (host as TestGatewayHost & { requestUpdate: () => void }).requestUpdate = requestUpdate;
    host.chatRunId = "run-task-1";
    host.sessionsResult = {
      ...(host.sessionsResult ?? {
        ts: 1,
        path: "",
        count: 1,
        defaults: { modelProvider: null, model: null, contextTokens: null },
        sessions: [],
      }),
      sessions: [
        {
          key: "main",
          kind: "direct",
          updatedAt: Date.now(),
          mode: "task",
          taskId: "task-current",
          hasActiveRun: true,
          status: "running",
        },
      ],
    } as never;

    client.emitEvent({
      event: "chat",
      payload: {
        runId: "run-task-1",
        sessionKey: "main",
        state: "final",
      },
    });

    expect(host.chatRunId).toBeNull();
    const sessionRow = (host.sessionsResult as SessionsListResult).sessions[0];
    expect(sessionRow).toMatchObject({
      key: "main",
      hasActiveRun: false,
      status: "done",
      endedAt: expect.any(Number),
    });
    expect(requestUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not reload task-mode data for terminal chat events from other sessions", () => {
    const { client, host } = connectHostGateway();
    host.chatRunId = "run-other";

    client.emitEvent({
      event: "chat",
      payload: {
        runId: "run-other",
        sessionKey: "other-session",
        state: "final",
      },
    });

    expect(loadTaskModeDataMock).not.toHaveBeenCalled();
  });

  it("shows chat pending state for active-session agent lifecycle runs when the chat run was cleared", () => {
    const { client, host } = connectHostGateway();

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "agent-dev-run-1",
        seq: 1,
        stream: "lifecycle",
        ts: 1,
        sessionKey: "main",
        data: { phase: "start" },
      },
    });

    expect(host.chatRunId).toBe("agent-dev-run-1");
    expect(host.chatStream).toBe("");
    expect(host.chatStreamStartedAt).toEqual(expect.any(Number));
    expect(host.agentLifecycleChatRunId).toBe("agent-dev-run-1");

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "agent-dev-run-1",
        seq: 2,
        stream: "lifecycle",
        ts: 2,
        sessionKey: "main",
        data: { phase: "end" },
      },
    });

    expect(host.chatRunId).toBeNull();
    expect(host.chatStream).toBeNull();
    expect(host.chatStreamStartedAt).toBeNull();
    expect(host.agentLifecycleChatRunId).toBeNull();
  });

  it("does not show chat pending state for another session's agent lifecycle run", () => {
    const { client, host } = connectHostGateway();

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "agent-dev-run-other",
        seq: 1,
        stream: "lifecycle",
        ts: 1,
        sessionKey: "other-session",
        data: { phase: "start" },
      },
    });

    expect(host.chatRunId).toBeNull();
    expect(host.chatStream).toBeNull();
    expect(host.agentLifecycleChatRunId).toBeNull();
  });

  it("records a lifecycle run without replacing an already tracked chat run", () => {
    const { client, host } = connectHostGateway();
    host.chatRunId = "chat-run-active";
    host.chatStream = "";

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "agent-dev-run-2",
        seq: 1,
        stream: "lifecycle",
        ts: 1,
        sessionKey: "main",
        data: { phase: "start" },
      },
    });

    expect(host.chatRunId).toBe("chat-run-active");
    expect(host.agentLifecycleChatRunId).toBe("agent-dev-run-2");
  });

  it("does not restore chat pending state after the visible chat final arrives", () => {
    const { client, host } = connectHostGateway();
    host.chatRunId = "chat-run-initial";
    host.chatStream = "";

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "agent-dev-run-3",
        seq: 1,
        stream: "lifecycle",
        ts: 1,
        sessionKey: "main",
        data: { phase: "start" },
      },
    });

    client.emitEvent({
      event: "chat",
      payload: {
        runId: "chat-run-initial",
        sessionKey: "main",
        state: "final",
      },
    });

    expect(host.chatRunId).toBeNull();
    expect(host.chatStream).toBeNull();
    expect(host.chatStreamStartedAt).toBeNull();
    expect(host.agentLifecycleChatRunId).toBe("agent-dev-run-3");

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "agent-dev-run-3",
        seq: 2,
        stream: "lifecycle",
        ts: 2,
        sessionKey: "main",
        data: { phase: "end" },
      },
    });

    expect(host.chatRunId).toBeNull();
    expect(host.chatStream).toBeNull();
    expect(host.agentLifecycleChatRunId).toBeNull();
  });

  it.each(["normal", "task"] as const)(
    "does not reload task-mode data for active-session chat finals when binding is incomplete (%s)",
    (mode) => {
      const { client, host } = connectHostGateway();
      host.chatRunId = "run-main";
      host.sessionsResult = {
        ...(host.sessionsResult ?? {
          ts: 1,
          path: "",
          count: 1,
          defaults: { modelProvider: null, model: null, contextTokens: null },
          sessions: [],
        }),
        sessions: [
          {
            key: "main",
            kind: "direct",
            updatedAt: Date.now(),
            mode,
            ...(mode === "task" ? { taskId: "" } : {}),
          },
        ],
      } as never;

      client.emitEvent({
        event: "chat",
        payload: {
          runId: "run-main",
          sessionKey: "main",
          state: "final",
        },
      });

      expect(loadTaskModeDataMock).not.toHaveBeenCalled();
    },
  );

  it("stores BTW side results for the active session", () => {
    const { host, client } = connectHostGateway();

    client.emitEvent({
      event: "chat.side_result",
      payload: {
        kind: "btw",
        runId: "btw-run-1",
        sessionKey: "main",
        question: "what changed?",
        text: "Only the UI layer is missing support.",
        ts: 123,
      },
    });

    expect(host.chatSideResult).toMatchObject({
      kind: "btw",
      runId: "btw-run-1",
      question: "what changed?",
      text: "Only the UI layer is missing support.",
    });
    expect(host.chatSideResultTerminalRuns.has("btw-run-1")).toBe(true);
  });

  it("ignores tracked BTW terminal finals without tearing down the active run", () => {
    const { host, client } = connectHostGateway();
    host.chatRunId = "main-run-1";
    emitToolResultEvent(client);
    host.chatStream = "still streaming";
    expect(host.toolStreamOrder).toHaveLength(1);

    client.emitEvent({
      event: "chat.side_result",
      payload: {
        kind: "btw",
        runId: "btw-run-2",
        sessionKey: "main",
        question: "what changed?",
        text: "A dedicated side-result card now renders in webchat.",
        ts: 456,
      },
    });
    client.emitEvent({
      event: "chat",
      payload: {
        runId: "btw-run-2",
        sessionKey: "main",
        state: "final",
      },
    });

    expect(loadChatHistoryMock).not.toHaveBeenCalled();
    expect(host.chatRunId).toBe("main-run-1");
    expect(host.chatStream).toBe("still streaming");
    expect(host.toolStreamOrder).toHaveLength(1);
    expect(host.chatSideResultTerminalRuns.has("btw-run-2")).toBe(false);
  });

  it.each(["aborted", "error"] as const)(
    "cleans up tracked BTW %s events without touching the active run",
    (terminalState) => {
      const { host, client } = connectHostGateway();
      host.chatRunId = "main-run-2";
      emitToolResultEvent(client);
      host.chatStream = "stream in progress";

      client.emitEvent({
        event: "chat.side_result",
        payload: {
          kind: "btw",
          runId: `btw-run-${terminalState}`,
          sessionKey: "main",
          question: "what changed?",
          text: "Detached BTW response",
          ts: 789,
        },
      });
      client.emitEvent({
        event: "chat",
        payload: {
          runId: `btw-run-${terminalState}`,
          sessionKey: "main",
          state: terminalState,
          errorMessage: terminalState === "error" ? "btw failed" : undefined,
        },
      });

      expect(host.chatSideResultTerminalRuns.has(`btw-run-${terminalState}`)).toBe(false);
      expect(host.chatRunId).toBe("main-run-2");
      expect(host.chatStream).toBe("stream in progress");
      expect(host.toolStreamOrder).toHaveLength(1);
      expect(host.lastError).toBeNull();
    },
  );

  it("clears tracked BTW terminal runs after reconnect hello", () => {
    const host = createHost();

    connectGateway(host);
    const firstClient = gatewayClientInstances[0];
    expect(firstClient).toBeDefined();

    firstClient.emitEvent({
      event: "chat.side_result",
      payload: {
        kind: "btw",
        runId: "btw-run-reconnect",
        sessionKey: "main",
        question: "what changed?",
        text: "Temporary BTW state",
        ts: 987,
      },
    });
    expect(host.chatSideResultTerminalRuns.has("btw-run-reconnect")).toBe(true);

    connectGateway(host);
    const reconnectClient = gatewayClientInstances[1];
    expect(reconnectClient).toBeDefined();

    reconnectClient.emitHello();

    expect(host.chatSideResultTerminalRuns.size).toBe(0);
  });

  it("clears recovered session-key pending markers when the run finishes", () => {
    const { host, client } = connectHostGateway();
    host.chatQueue = [
      {
        id: "recovered-active-run",
        text: "guide this running session",
        createdAt: 1,
        pendingRunId: "main",
      },
      {
        id: "queued-next",
        text: "next turn",
        createdAt: 2,
      },
    ];

    client.emitEvent({
      event: "chat",
      payload: {
        runId: "actual-run-id",
        sessionKey: "main",
        state: "final",
      },
    });

    expect(host.chatQueue).toEqual([
      expect.objectContaining({
        id: "queued-next",
        text: "next turn",
      }),
    ]);
  });

  it("renders session-scoped tool events for externally started runs", () => {
    const { host, client } = connectHostGateway();

    client.emitEvent({
      event: "session.tool",
      payload: {
        runId: "external-run-1",
        seq: 1,
        stream: "tool",
        ts: 123,
        sessionKey: "main",
        data: {
          toolCallId: "session-tool-1",
          name: "exec",
          phase: "start",
          args: { command: "pwd" },
        },
      },
    });

    expect(host.toolStreamOrder).toStrictEqual(["session-tool-1"]);
    const entry = host.toolStreamById.get("session-tool-1") as
      | { args?: unknown; name?: string; runId?: string; sessionKey?: string }
      | undefined;
    expect(entry).toMatchObject({
      args: { command: "pwd" },
      name: "exec",
      runId: "external-run-1",
      sessionKey: "main",
    });
    expect(loadChatHistoryMock).not.toHaveBeenCalled();
  });

  it("ignores BTW side results for other sessions", () => {
    const { host, client } = connectHostGateway();

    client.emitEvent({
      event: "chat.side_result",
      payload: {
        kind: "btw",
        runId: "btw-run-3",
        sessionKey: "other-session",
        question: "what changed?",
        text: "Nothing here.",
        ts: 789,
      },
    });

    expect(host.chatSideResult).toBeNull();
    expect(host.chatSideResultTerminalRuns.size).toBe(0);
  });

  it("routes plugin.approval.requested into execApprovalQueue with kind plugin", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitEvent({
      event: "plugin.approval.requested",
      payload: {
        id: "plugin-approval-1",
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + 120_000,
        request: {
          title: "Dangerous command detected",
          description: "chmod 777 script.sh",
          severity: "high",
          pluginId: "sage",
          agentId: "agent-1",
          sessionKey: "main",
        },
      },
    });

    expect(host.execApprovalQueue).toHaveLength(1);
    expect(host.execApprovalQueue[0]?.id).toBe("plugin-approval-1");
    expect((host.execApprovalQueue[0] as { kind: string }).kind).toBe("plugin");
  });

  it("routes plugin.approval.resolved to remove from execApprovalQueue", () => {
    const host = createHost();

    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    // Add a plugin approval first
    client.emitEvent({
      event: "plugin.approval.requested",
      payload: {
        id: "plugin-approval-2",
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + 120_000,
        request: { title: "Alert" },
      },
    });
    expect(host.execApprovalQueue).toHaveLength(1);

    // Resolve it
    client.emitEvent({
      event: "plugin.approval.resolved",
      payload: { id: "plugin-approval-2", decision: "allow-once" },
    });
    expect(host.execApprovalQueue).toHaveLength(0);
  });

  it("reloads chat history once after the final chat event when tool output was used", () => {
    const { client } = connectHostGateway();
    emitToolResultEvent(client);

    client.emitEvent({
      event: "chat",
      payload: {
        runId: "engine-run-1",
        sessionKey: "main",
        state: "final",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Done" }],
        },
      },
    });

    expect(loadChatHistoryMock).toHaveBeenCalledTimes(1);
  });

  it("captures change review after a final chat event in the active session when review mode is enabled", async () => {
    const host = createHost();
    host.settings.changeReviewModeEnabled = true;
    host.captureChangeReview = vi.fn(async () => undefined);
    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    emitToolResultEvent(client);
    client.emitEvent({
      event: "chat",
      payload: {
        runId: "engine-run-1",
        sessionKey: "main",
        state: "final",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Done" }],
        },
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(host.captureChangeReview).toHaveBeenCalledWith("main", "engine-run-1");
  });

  it("captures change review as soon as a patch event finishes in the active session", async () => {
    const host = createHost();
    host.settings.changeReviewModeEnabled = true;
    host.captureChangeReview = vi.fn(async () => undefined);
    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "engine-run-patch",
        seq: 1,
        stream: "patch",
        ts: 1,
        sessionKey: "main",
        data: {
          phase: "end",
          itemId: "patch:tool-1",
          toolCallId: "tool-1",
          name: "edit",
          modified: ["supply_vue/.gitignore"],
          summary: "1 modified",
        },
      },
    });
    await Promise.resolve();

    expect(host.captureChangeReview).toHaveBeenCalledWith("main", "engine-run-patch");
  });

  it("captures change review as soon as a mutating tool result arrives in the active session", async () => {
    const host = createHost();
    host.settings.changeReviewModeEnabled = true;
    host.captureChangeReview = vi.fn(async () => undefined);
    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "engine-run-exec",
        seq: 1,
        stream: "tool",
        ts: 1,
        sessionKey: "main",
        data: {
          phase: "result",
          toolCallId: "tool-exec-1",
          name: "exec",
          result: { text: "ok" },
        },
      },
    });
    await Promise.resolve();

    expect(host.captureChangeReview).toHaveBeenCalledWith("main", "engine-run-exec");
  });

  it("captures change review immediately when a ready review event arrives", async () => {
    const host = createHost();
    host.settings.changeReviewModeEnabled = true;
    host.captureChangeReview = vi.fn(async () => undefined);
    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "engine-run-ready",
        seq: 1,
        stream: "change_review",
        ts: 1,
        sessionKey: "main",
        data: {
          phase: "ready",
          reviewId: "review-1",
          files: [{ path: "supply_vue/.gitignore", changeType: "modified" }],
        },
      },
    });
    await Promise.resolve();

    expect(host.captureChangeReview).toHaveBeenCalledWith("main", "engine-run-ready");
  });

  it("treats main and agent:solo:main as the same session for capture triggers", async () => {
    const host = createHost();
    host.sessionKey = "agent:solo:main";
    host.settings.sessionKey = "agent:solo:main";
    host.settings.lastActiveSessionKey = "agent:solo:main";
    host.settings.changeReviewModeEnabled = true;
    host.captureChangeReview = vi.fn(async () => undefined);
    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    client.emitEvent({
      event: "agent",
      payload: {
        runId: "engine-run-alias",
        seq: 1,
        stream: "patch",
        ts: 1,
        sessionKey: "main",
        data: {
          phase: "end",
          itemId: "patch:tool-alias",
          toolCallId: "tool-alias",
          name: "edit",
          modified: ["supply_vue/.gitignore"],
          summary: "1 modified",
        },
      },
    });
    await Promise.resolve();

    expect(host.captureChangeReview).toHaveBeenCalledWith("main", "engine-run-alias");
  });

  it("does not capture change review for another session even when review mode is enabled", async () => {
    const host = createHost();
    host.settings.changeReviewModeEnabled = true;
    host.captureChangeReview = vi.fn(async () => undefined);
    connectGateway(host);
    const client = gatewayClientInstances[0];
    expect(client).toBeDefined();

    emitToolResultEvent(client);
    client.emitEvent({
      event: "chat",
      payload: {
        runId: "engine-run-1",
        sessionKey: "other-session",
        state: "final",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Done" }],
        },
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(host.captureChangeReview).not.toHaveBeenCalled();
  });
});

describe("continueDevExecuteAfterSessionRefresh", () => {
  it("marks the refreshed session for one resumed dev-execute turn", () => {
    const host = createHost();
    host.settings.changeReviewModeEnabled = true;
    host.devExecuteCarryoverAfterChatByRun.set("run-dev-1", {
      changeReviewModeEnabled: true,
      sourceSessionKey: "main",
    });

    continueDevExecuteAfterSessionRefresh(host, "run-dev-1", "session-refreshed");

    expect(host.devExecuteCarryoverAfterChatByRun.has("run-dev-1")).toBe(false);
    expect(host.resumedDevExecuteBySessionKey.get("session-refreshed")).toEqual({
      changeReviewModeEnabled: true,
      remainingTurns: 1,
    });
  });

  it("does not carry dev-execute onto the same source session by default", () => {
    const host = createHost();
    host.devExecuteCarryoverAfterChatByRun.set("run-dev-2", {
      changeReviewModeEnabled: true,
      sourceSessionKey: "main",
    });

    continueDevExecuteAfterSessionRefresh(host, "run-dev-2", "main");

    expect(host.devExecuteCarryoverAfterChatByRun.has("run-dev-2")).toBe(false);
    expect(host.resumedDevExecuteBySessionKey.size).toBe(0);
  });

  it("allows dev-execute carryover on reset-in-place sessions when explicitly flagged", () => {
    const host = createHost();
    host.settings.changeReviewModeEnabled = true;
    host.devExecuteCarryoverAfterChatByRun.set("run-dev-3", {
      changeReviewModeEnabled: true,
      sourceSessionKey: "main",
      allowSameSession: true,
    });

    continueDevExecuteAfterSessionRefresh(host, "run-dev-3", "main");

    expect(host.devExecuteCarryoverAfterChatByRun.has("run-dev-3")).toBe(false);
    expect(host.resumedDevExecuteBySessionKey.get("main")).toEqual({
      changeReviewModeEnabled: true,
      remainingTurns: 1,
    });
  });

  it("does not resume dev-execute after refresh when change review has been turned off", () => {
    const host = createHost();
    host.settings.changeReviewModeEnabled = false;
    host.resumedDevExecuteBySessionKey.set("session-refreshed", {
      changeReviewModeEnabled: true,
      remainingTurns: 1,
    });
    host.devExecuteCarryoverAfterChatByRun.set("run-dev-4", {
      changeReviewModeEnabled: true,
      sourceSessionKey: "main",
    });

    continueDevExecuteAfterSessionRefresh(host, "run-dev-4", "session-refreshed");

    expect(host.devExecuteCarryoverAfterChatByRun.has("run-dev-4")).toBe(false);
    expect(host.resumedDevExecuteBySessionKey.has("session-refreshed")).toBe(false);
  });
});

describe("resolveControlUiClientVersion", () => {
  it("returns serverVersion for same-origin websocket targets", () => {
    expect(
      resolveControlUiClientVersion({
        gatewayUrl: "ws://localhost:8787",
        serverVersion: "2026.3.7",
        pageUrl: "http://localhost:8787/openclaw/",
      }),
    ).toBe("2026.3.7");
  });

  it("returns serverVersion for same-origin relative targets", () => {
    expect(
      resolveControlUiClientVersion({
        gatewayUrl: "/ws",
        serverVersion: "2026.3.7",
        pageUrl: "https://control.example.com/openclaw/",
      }),
    ).toBe("2026.3.7");
  });

  it("returns serverVersion for same-origin http targets", () => {
    expect(
      resolveControlUiClientVersion({
        gatewayUrl: "https://control.example.com/ws",
        serverVersion: "2026.3.7",
        pageUrl: "https://control.example.com/openclaw/",
      }),
    ).toBe("2026.3.7");
  });

  it("omits serverVersion for cross-origin targets", () => {
    expect(
      resolveControlUiClientVersion({
        gatewayUrl: "wss://gateway.example.com",
        serverVersion: "2026.3.7",
        pageUrl: "https://control.example.com/openclaw/",
      }),
    ).toBeUndefined();
  });
});
